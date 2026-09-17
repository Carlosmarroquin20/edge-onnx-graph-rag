/**
 * Client-side Graph-RAG session.
 *
 * Owns the browser-resident state the React layer drives: the constructed
 * knowledge graph, a lazily-initialized inference engine, and a cross-run
 * metrics aggregator. Inference runs in a Web Worker (see `WorkerEngineClient`),
 * so the Transformers.js runtime is never evaluated on the main thread or during
 * server rendering; retrieval and context assembly stay on the main thread.
 */

import {
  GraphBuilder,
  GraphStore,
  estimateTokensByChars,
  extractByCooccurrence,
  extractTriples,
  resolveSeedsBySimilarity,
} from "@core/graph";
import type { AssembledContext } from "@core/graph";
import {
  GraphRagPipeline,
  buildLabelIndex,
  resolveSeedsFromIndex,
  type GraphRagOptions,
} from "@core/pipeline";
import { MetricsAggregator, profileGeneration } from "@core/profiler";
import type {
  AggregatedMetrics,
  BackendKind,
  ExecutionMetrics,
  InferenceEngine,
  ModelLoadProgress,
  NodeId,
  ProgressListener,
  SubgraphResult,
} from "@core/types";
import { WorkerEngineClient, type Embedder } from "./workerEngineClient.js";
import { validateModelId } from "./modelId.js";
import { describeEngineFailure } from "./engineErrors.js";
import type { CorpusMode } from "./sampleData.js";

export interface GraphStats {
  readonly nodeCount: number;
  readonly edgeCount: number;
}

/**
 * User-facing backend selection. `auto` negotiates WebGPU→WASM; the explicit
 * choices force a single backend (forcing `webgpu` on a host without it surfaces
 * as an init error rather than a silent fallback).
 */
export type BackendChoice = "auto" | "webgpu" | "wasm";

/** Maps a user choice to a factory preference list; `auto` uses the default. */
function preferenceFor(choice: BackendChoice): readonly BackendKind[] | undefined {
  switch (choice) {
    case "webgpu":
      return ["webgpu"];
    case "wasm":
      return ["wasm"];
    case "auto":
      return undefined;
  }
}

export interface AskHandlers {
  /** Invoked with each decoded text delta as it streams. */
  readonly onToken: (text: string) => void;
  /** Invoked with engine load/init progress messages. */
  readonly onStatus?: (status: string) => void;
  /** Invoked with model-download progress events during the first load. */
  readonly onProgress?: (progress: ModelLoadProgress) => void;
  /** Cancellation signal for the generation. */
  readonly signal?: AbortSignal;
  /** Retrieval/generation overrides forwarded to the pipeline. */
  readonly options?: GraphRagOptions;
}

export interface AskOutcome {
  readonly answer: string;
  readonly context: AssembledContext;
  readonly seedLabels: ReadonlyArray<string>;
  /** Seed node ids, for highlighting the anchors in the subgraph view. */
  readonly seedIds: ReadonlyArray<NodeId>;
  /** The retrieved subgraph, for visualization. */
  readonly subgraph: SubgraphResult;
  readonly metrics: ExecutionMetrics;
}

export class GraphRagSession {
  private store = new GraphStore();
  /** Label→id index over `store`, rebuilt only when the graph changes. */
  private labelIndex: ReadonlyMap<string, NodeId> = new Map();
  private readonly aggregator = new MetricsAggregator();
  private enginePromise: Promise<InferenceEngine & Embedder> | null = null;
  private busy = false;
  private modelId: string;
  private backend: BackendChoice;
  /** When true, retrieval blends semantic similarity into structural ranking. */
  private semanticRerank = true;
  /** Whether the current graph's node embeddings have been populated. */
  private nodesEmbedded = false;

  constructor(modelId: string, backend: BackendChoice = "auto") {
    this.modelId = requireValidModelId(modelId);
    this.backend = backend;
  }

  /** Rebuilds the graph from source text. Replaces any prior graph. */
  buildGraph(source: string, mode: CorpusMode): GraphStats {
    const builder = new GraphBuilder();
    builder.ingest(mode === "triples" ? extractTriples(source) : extractByCooccurrence(source));
    this.store = builder.graph;
    // Index built once here; reused across every subsequent query.
    this.labelIndex = buildLabelIndex(this.store);
    // A new graph needs fresh node embeddings before semantic re-ranking applies.
    this.nodesEmbedded = false;
    return { nodeCount: this.store.nodeCount, edgeCount: this.store.edgeCount };
  }

  get semanticRerankEnabled(): boolean {
    return this.semanticRerank;
  }

  /**
   * Toggles hybrid semantic re-ranking. Cheap — the embedder shares the existing
   * worker, so no engine teardown is needed; the next turn simply blends (or
   * skips) the semantic signal.
   */
  setSemanticRerank(enabled: boolean): void {
    this.semanticRerank = enabled;
  }

  get graphStats(): GraphStats {
    return { nodeCount: this.store.nodeCount, edgeCount: this.store.edgeCount };
  }

  /**
   * Selects a model, discarding any engine bound to the previous one. The id is
   * validated before it can reach the loader; an invalid id throws.
   */
  async setModel(modelId: string): Promise<void> {
    const next = requireValidModelId(modelId);
    if (next === this.modelId) {
      return;
    }
    await this.disposeEngine();
    this.modelId = next;
  }

  get backendChoice(): BackendChoice {
    return this.backend;
  }

  /**
   * Pins the execution backend, discarding any engine bound to the previous
   * choice so the next turn re-negotiates. `auto` restores WebGPU→WASM fallback.
   */
  async setBackend(choice: BackendChoice): Promise<void> {
    if (choice === this.backend) {
      return;
    }
    await this.disposeEngine();
    this.backend = choice;
  }

  /**
   * Spins up the inference worker, which loads the Transformers.js runtime,
   * negotiates a backend, and warms the model off the main thread. Subsequent
   * calls reuse the same worker. A failed load is not cached, so the next call
   * retries from a clean slate.
   */
  async ensureEngine(
    onStatus?: (status: string) => void,
    onProgress?: ProgressListener,
  ): Promise<InferenceEngine & Embedder> {
    if (this.enginePromise === null) {
      this.enginePromise = this.createEngine(onStatus, onProgress);
    }
    return this.enginePromise;
  }

  private async createEngine(
    onStatus?: (status: string) => void,
    onProgress?: ProgressListener,
  ): Promise<InferenceEngine & Embedder> {
    onStatus?.("Loading model in a worker…");
    // No dtype hint: each backend applies its own default (q4 on WebGPU, q8 on
    // WASM). The preference forces the backend when the user pinned one.
    const engine = new WorkerEngineClient(
      { modelId: this.modelId },
      preferenceFor(this.backend),
    );
    try {
      await engine.init(onProgress);
    } catch (error) {
      // Tear down the worker and clear the cached promise so a retry is possible.
      await engine.dispose();
      this.enginePromise = null;
      const raw = error instanceof Error ? error.message : String(error);
      throw new Error(describeEngineFailure(raw, this.backend), { cause: error });
    }
    onStatus?.(`Ready on ${engine.backend.toUpperCase()}.`);
    return engine;
  }

  /** True while a generation turn is in flight. */
  get isGenerating(): boolean {
    return this.busy;
  }

  /**
   * Runs one Graph-RAG turn: retrieve, assemble, stream generation, and record
   * profiler metrics. Prompt token count is estimated (the streaming path does
   * not re-encode); all timing and throughput figures are measured.
   *
   * The underlying pipeline is not reentrant, so overlapping turns are rejected
   * rather than allowed to corrupt each other.
   */
  async ask(query: string, handlers: AskHandlers): Promise<AskOutcome> {
    if (this.busy) {
      throw new Error(
        "A generation is already in progress; cancel it or wait for it to finish.",
      );
    }
    this.busy = true;
    try {
      const engine = await this.ensureEngine(handlers.onStatus, handlers.onProgress);

      // Best-effort semantic re-ranking: embed the graph (once) and the query,
      // then let the pipeline blend similarity into the structural ranking. Any
      // failure degrades cleanly to purely-structural retrieval.
      const queryEmbedding = await this.computeQueryEmbedding(
        engine,
        query,
        handlers.onStatus,
      );

      const pipeline = new GraphRagPipeline(engine, this.store, {
        resolveSeeds: (_store, text) => this.resolveSeeds(text, queryEmbedding),
      });

      const baseOptions = handlers.options ?? {};
      const runOptions: GraphRagOptions = {
        ...baseOptions,
        ...(queryEmbedding !== undefined ? { queryEmbedding } : {}),
        generation: {
          ...baseOptions.generation,
          ...(handlers.signal ? { signal: handlers.signal } : {}),
        },
      };

      const { prompt, context, seeds, subgraph, tokens } = pipeline.stream(query, runOptions);

      const run = profileGeneration(tokens, {
        backend: engine.backend,
        modelId: this.modelId,
        promptTokenCount: estimateTokensByChars(prompt),
      });

      let answer = "";
      for await (const token of run.tokens) {
        answer += token.text;
        handlers.onToken(token.text);
      }

      const metrics = await run.metrics;
      this.aggregator.add(metrics);

      return {
        answer,
        context,
        seedLabels: this.labelsFor(seeds),
        seedIds: seeds,
        subgraph,
        metrics,
      };
    } finally {
      this.busy = false;
    }
  }

  /**
   * Resolves the seed nodes that anchor retrieval. Exact label matching first;
   * when the query names no graph-resident entity (a description rather than a
   * proper noun) and a query embedding is available, falls back to the nodes most
   * semantically similar to the query, so descriptive questions still retrieve.
   */
  private resolveSeeds(
    query: string,
    queryEmbedding: number[] | undefined,
  ): ReadonlyArray<NodeId> {
    const labelSeeds = resolveSeedsFromIndex(this.labelIndex, query);
    if (labelSeeds.length > 0 || queryEmbedding === undefined) {
      return labelSeeds;
    }
    return resolveSeedsBySimilarity([...this.store.nodes()], queryEmbedding);
  }

  /**
   * Embeds the query for hybrid re-ranking, ensuring the graph's node embeddings
   * exist first. Returns `undefined` (structural-only) when re-ranking is
   * disabled, the graph is empty, or embedding fails — the enhancement never
   * blocks a turn.
   */
  private async computeQueryEmbedding(
    engine: Embedder,
    query: string,
    onStatus?: (status: string) => void,
  ): Promise<number[] | undefined> {
    if (!this.semanticRerank) {
      return undefined;
    }
    try {
      await this.ensureNodeEmbeddings(engine, onStatus);
      onStatus?.("Embedding query…");
      const [vector] = await engine.embed([query]);
      return vector;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      onStatus?.(`Semantic re-ranking unavailable (${reason}); using structural retrieval.`);
      return undefined;
    }
  }

  /** Populates every node's embedding from its label, once per graph. */
  private async ensureNodeEmbeddings(
    engine: Embedder,
    onStatus?: (status: string) => void,
  ): Promise<void> {
    if (this.nodesEmbedded) {
      return;
    }
    const nodes = [...this.store.nodes()];
    if (nodes.length === 0) {
      this.nodesEmbedded = true;
      return;
    }
    onStatus?.("Embedding knowledge graph…");
    const vectors = await engine.embed(nodes.map((node) => node.label));
    nodes.forEach((node, index) => {
      const vector = vectors[index];
      if (vector !== undefined) {
        this.store.setNodeEmbedding(node.id, vector);
      }
    });
    this.nodesEmbedded = true;
  }

  aggregates(): AggregatedMetrics[] {
    return this.aggregator.snapshot();
  }

  async disposeEngine(): Promise<void> {
    const pending = this.enginePromise;
    this.enginePromise = null;
    if (pending !== null) {
      try {
        const engine = await pending;
        await engine.dispose();
      } catch {
        // A failed load leaves nothing to dispose; ignore.
      }
    }
  }

  private labelsFor(seeds: ReadonlyArray<NodeId>): string[] {
    const labels: string[] = [];
    for (const id of seeds) {
      const node = this.store.getNode(id);
      if (node !== undefined) {
        labels.push(node.label);
      }
    }
    return labels;
  }
}

/** Returns the normalized id, or throws with the validation reason. */
function requireValidModelId(modelId: string): string {
  const result = validateModelId(modelId);
  if (!result.ok || result.normalized === undefined) {
    throw new Error(result.reason ?? "Invalid model id.");
  }
  return result.normalized;
}
