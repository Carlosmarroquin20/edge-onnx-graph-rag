/**
 * Graph-RAG pipeline.
 *
 * Composition root for retrieval-augmented generation over the in-memory
 * knowledge graph. Wires the four primitives into one flow:
 *
 *   query → seed resolution → k-hop retrieval → context assembly →
 *   prompt augmentation → engine generation
 *
 * Depends only on the {@link InferenceEngine} contract — never a concrete
 * backend — so the orchestration is testable without loading a model. Seed
 * resolution and the prompt template are injectable; sensible defaults are
 * provided.
 */

import type {
  GenerationOptions,
  GenerationToken,
  InferenceEngine,
} from "../types/inference.js";
import type { ExecutionMetrics } from "../types/metrics.js";
import type {
  NodeId,
  TraversalDirection,
} from "../types/graph.js";
import { GraphStore } from "../graph/GraphStore.js";
import { retrieveNeighborhood } from "../graph/traversal.js";
import {
  assembleContext,
  type AssembledContext,
  type TokenEstimator,
} from "../graph/contextAssembler.js";
import { extractByCooccurrence, normalizeLabel } from "../graph/extraction.js";

const DEFAULT_MAX_HOPS = 2;
const DEFAULT_TOKEN_BUDGET = 512;

/** Resolves a free-text query to the seed nodes that anchor retrieval. */
export type SeedResolver = (
  store: GraphStore,
  query: string,
) => ReadonlyArray<NodeId>;

/** Renders the final prompt from the assembled context and the user query. */
export type PromptTemplate = (context: string, query: string) => string;

export interface GraphRagOptions {
  /** Maximum hop distance during retrieval. Defaults to 2. */
  readonly maxHops?: number;
  /** Cap on retrieved nodes, bounding context size before budgeting. */
  readonly maxNodes?: number;
  /** Token budget for the assembled context block. Defaults to 512. */
  readonly tokenBudget?: number;
  /** Expansion direction for retrieval. */
  readonly direction?: TraversalDirection;
  /** Restrict retrieval to these relation labels. */
  readonly relations?: ReadonlyArray<string>;
  /** Optional header line prefixed to the context block. */
  readonly header?: string;
  /** Token estimator for budgeting; defaults to the char heuristic. */
  readonly estimateTokens?: TokenEstimator;
  /** Generation parameters forwarded to the engine. */
  readonly generation?: GenerationOptions;
}

/** The retrieval-side artifacts produced before the engine is invoked. */
export interface PreparedQuery {
  /** The augmented prompt sent to the engine. */
  readonly prompt: string;
  /** The assembled context block and its budgeting metadata. */
  readonly context: AssembledContext;
  /** Seed nodes that anchored retrieval. */
  readonly seeds: ReadonlyArray<NodeId>;
}

export interface GraphRagResult extends PreparedQuery {
  /** The generated answer. */
  readonly answer: string;
  /** Profiler record for the generation run. */
  readonly metrics: ExecutionMetrics;
}

export interface GraphRagStream extends PreparedQuery {
  /** Token stream for the augmented prompt. */
  readonly tokens: AsyncIterable<GenerationToken>;
}

/**
 * Default seed resolver: extracts proper-noun mentions from the query and maps
 * them to nodes whose label matches (by normalized key). Unmatched mentions are
 * ignored; a query with no graph-resident entities yields no seeds, degrading
 * gracefully to context-free generation.
 */
export const resolveSeedsByLabel: SeedResolver = (store, query) => {
  const index = new Map<string, NodeId>();
  for (const node of store.nodes()) {
    index.set(normalizeLabel(node.label), node.id);
  }

  const seeds: NodeId[] = [];
  const seen = new Set<NodeId>();
  for (const mention of extractByCooccurrence(query).nodes) {
    const id = index.get(normalizeLabel(mention.label));
    if (id !== undefined && !seen.has(id)) {
      seen.add(id);
      seeds.push(id);
    }
  }
  return seeds;
};

/** Default prompt template; emits the query alone when no context was retrieved. */
export const defaultPromptTemplate: PromptTemplate = (context, query) => {
  if (context.trim().length === 0) {
    return query;
  }
  return [
    "Answer the question using the knowledge graph context below.",
    "",
    "Context:",
    context,
    "",
    `Question: ${query}`,
    "Answer:",
  ].join("\n");
};

export interface GraphRagPipelineOptions {
  readonly resolveSeeds?: SeedResolver;
  readonly promptTemplate?: PromptTemplate;
}

export class GraphRagPipeline {
  private readonly engine: InferenceEngine;
  private readonly store: GraphStore;
  private readonly resolveSeeds: SeedResolver;
  private readonly promptTemplate: PromptTemplate;

  constructor(
    engine: InferenceEngine,
    store: GraphStore,
    options: GraphRagPipelineOptions = {},
  ) {
    this.engine = engine;
    this.store = store;
    this.resolveSeeds = options.resolveSeeds ?? resolveSeedsByLabel;
    this.promptTemplate = options.promptTemplate ?? defaultPromptTemplate;
  }

  /**
   * Runs the retrieval side only: resolve seeds, retrieve the neighborhood,
   * assemble context, and render the augmented prompt. Pure with respect to the
   * engine, so it is fully testable in isolation.
   */
  prepare(query: string, options: GraphRagOptions = {}): PreparedQuery {
    const seeds = this.resolveSeeds(this.store, query);

    const subgraph = retrieveNeighborhood(this.store, {
      start: seeds,
      maxHops: options.maxHops ?? DEFAULT_MAX_HOPS,
      ...(options.maxNodes !== undefined ? { limit: options.maxNodes } : {}),
      ...(options.relations !== undefined ? { relations: options.relations } : {}),
      ...(options.direction !== undefined ? { direction: options.direction } : {}),
    });

    const context = assembleContext(subgraph, {
      tokenBudget: options.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
      ...(options.header !== undefined ? { header: options.header } : {}),
      ...(options.estimateTokens !== undefined
        ? { estimateTokens: options.estimateTokens }
        : {}),
    });

    const prompt = this.promptTemplate(context.text, query);
    return { prompt, context, seeds };
  }

  /** Runs the full pipeline and returns the answer with profiler metrics. */
  async run(query: string, options: GraphRagOptions = {}): Promise<GraphRagResult> {
    const prepared = this.prepare(query, options);
    const result = await this.engine.complete(prepared.prompt, options.generation);
    return {
      ...prepared,
      answer: result.text,
      metrics: result.metrics,
    };
  }

  /** Runs the full pipeline, exposing the answer as a token stream. */
  stream(query: string, options: GraphRagOptions = {}): GraphRagStream {
    const prepared = this.prepare(query, options);
    return {
      ...prepared,
      tokens: this.engine.generate(prepared.prompt, options.generation),
    };
  }
}
