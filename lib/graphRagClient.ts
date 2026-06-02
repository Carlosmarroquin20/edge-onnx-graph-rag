/**
 * Client-side Graph-RAG session.
 *
 * Owns the browser-resident state the React layer drives: the constructed
 * knowledge graph, a lazily-initialized inference engine, and a cross-run
 * metrics aggregator. The engine (and its Transformers.js runtime) is imported
 * dynamically so it is never evaluated during server rendering.
 */

import {
  GraphBuilder,
  GraphStore,
  estimateTokensByChars,
  extractByCooccurrence,
  extractTriples,
} from "@core/graph";
import type { AssembledContext } from "@core/graph";
import { GraphRagPipeline, type GraphRagOptions } from "@core/pipeline";
import { MetricsAggregator, profileGeneration } from "@core/profiler";
import type {
  AggregatedMetrics,
  ExecutionMetrics,
  InferenceEngine,
  NodeId,
} from "@core/types";
import type { CorpusMode } from "./sampleData.js";

export interface GraphStats {
  readonly nodeCount: number;
  readonly edgeCount: number;
}

export interface AskHandlers {
  /** Invoked with each decoded text delta as it streams. */
  readonly onToken: (text: string) => void;
  /** Invoked with engine load/init progress messages. */
  readonly onStatus?: (status: string) => void;
  /** Cancellation signal for the generation. */
  readonly signal?: AbortSignal;
  /** Retrieval/generation overrides forwarded to the pipeline. */
  readonly options?: GraphRagOptions;
}

export interface AskOutcome {
  readonly answer: string;
  readonly context: AssembledContext;
  readonly seedLabels: ReadonlyArray<string>;
  readonly metrics: ExecutionMetrics;
}

export class GraphRagSession {
  private store = new GraphStore();
  private readonly aggregator = new MetricsAggregator();
  private enginePromise: Promise<InferenceEngine> | null = null;

  constructor(
    private modelId: string,
    private readonly dtype: "fp32" | "fp16" | "q8" | "q4" = "q4",
  ) {}

  /** Rebuilds the graph from source text. Replaces any prior graph. */
  buildGraph(source: string, mode: CorpusMode): GraphStats {
    const builder = new GraphBuilder();
    builder.ingest(mode === "triples" ? extractTriples(source) : extractByCooccurrence(source));
    this.store = builder.graph;
    return { nodeCount: this.store.nodeCount, edgeCount: this.store.edgeCount };
  }

  get graphStats(): GraphStats {
    return { nodeCount: this.store.nodeCount, edgeCount: this.store.edgeCount };
  }

  /** Selects a model, discarding any engine bound to the previous one. */
  async setModel(modelId: string): Promise<void> {
    if (modelId === this.modelId) {
      return;
    }
    await this.disposeEngine();
    this.modelId = modelId;
  }

  /**
   * Lazily loads the Transformers.js runtime, negotiates a backend, and warms
   * the model. Subsequent calls reuse the same engine.
   */
  async ensureEngine(onStatus?: (status: string) => void): Promise<InferenceEngine> {
    if (this.enginePromise === null) {
      this.enginePromise = (async () => {
        onStatus?.("Loading inference runtime…");
        const { createInferenceEngine } = await import("@core/engine/createEngine");
        const engine = await createInferenceEngine({
          modelId: this.modelId,
          dtype: this.dtype,
        });
        onStatus?.(`Initializing model on ${engine.backend.toUpperCase()}…`);
        await engine.init();
        onStatus?.(`Ready on ${engine.backend.toUpperCase()}.`);
        return engine;
      })();
    }
    return this.enginePromise;
  }

  /**
   * Runs one Graph-RAG turn: retrieve, assemble, stream generation, and record
   * profiler metrics. Prompt token count is estimated (the streaming path does
   * not re-encode); all timing and throughput figures are measured.
   */
  async ask(query: string, handlers: AskHandlers): Promise<AskOutcome> {
    const engine = await this.ensureEngine(handlers.onStatus);
    const pipeline = new GraphRagPipeline(engine, this.store);

    const baseOptions = handlers.options ?? {};
    const runOptions: GraphRagOptions = {
      ...baseOptions,
      generation: { ...baseOptions.generation, ...(handlers.signal ? { signal: handlers.signal } : {}) },
    };

    const { prompt, context, seeds, tokens } = pipeline.stream(query, runOptions);

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

    return { answer, context, seedLabels: this.labelsFor(seeds), metrics };
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
