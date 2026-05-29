/**
 * Inference contracts.
 *
 * Defines the backend-agnostic interface every execution backend fulfills and
 * the runtime types used to negotiate and drive in-browser model execution.
 */

import type { ExecutionMetrics } from "./metrics.js";

/**
 * Concrete execution backend. Discriminant used throughout factory negotiation
 * and metrics attribution. Order of preference is defined by the factory, not here.
 */
export type BackendKind = "webgpu" | "wasm";

/** Immutable result of probing the host runtime once at startup. */
export interface CapabilityReport {
  /** A WebGPU adapter was successfully requested from `navigator.gpu`. */
  readonly isWebGpuAvailable: boolean;
  /** WASM SIMD instructions are supported by the host. */
  readonly hasWasmSimd: boolean;
  /**
   * Multi-threaded WASM is usable: `SharedArrayBuffer` exists and the document
   * is cross-origin isolated. Both are required for ORT WASM threads.
   */
  readonly hasWasmThreads: boolean;
  /** `crossOriginIsolated === true`; gates `SharedArrayBuffer` and threads. */
  readonly isCrossOriginIsolated: boolean;
  /** Logical core count hint for thread-pool sizing; `undefined` if unexposed. */
  readonly hardwareConcurrency: number | undefined;
}

/** Parameters controlling token generation. All fields optional with backend defaults. */
export interface GenerationOptions {
  readonly maxNewTokens?: number;
  readonly temperature?: number;
  readonly topK?: number;
  readonly topP?: number;
  /** Cooperative cancellation for long generations. */
  readonly signal?: AbortSignal;
}

/**
 * A single decode step emitted by the generation stream.
 *
 * A step is a decoded text delta. Byte-level BPE tokenizers buffer partial
 * code points, so one delta may span several underlying tokens; `tokenId`
 * therefore carries the most recent originating token id and is absent when no
 * 1:1 mapping is available for the delta.
 */
export interface GenerationToken {
  /** Decoded text fragment produced at this step. */
  readonly text: string;
  /** Most recent originating token id, when a mapping is available. */
  readonly tokenId?: number;
  /** Zero-based index of this delta within the generation stream. */
  readonly index: number;
  /** True for the terminal step (EOS, cancellation, or `maxNewTokens` reached). */
  readonly isLast: boolean;
}

/** Terminal result of a completed generation, including profiler output. */
export interface GenerationResult {
  /** Full decoded completion text. */
  readonly text: string;
  readonly metrics: ExecutionMetrics;
}

/** Configuration required to initialize an engine against a specific model. */
export interface EngineConfig {
  /** Model repository id or resolvable identifier (e.g. Hugging Face repo). */
  readonly modelId: string;
  /** Pinned model revision for reproducibility. */
  readonly revision?: string;
  /** Quantization/precision hint passed through to the backend pipeline. */
  readonly dtype?: "fp32" | "fp16" | "q8" | "q4";
  /** Thread-pool size for the WASM backend; ignored by WebGPU. */
  readonly threads?: number;
}

/**
 * Backend-agnostic inference engine.
 *
 * Lifecycle: `init` (load + warm up) → repeated `generate` → `dispose`.
 * Implementations must release all GPU/WASM resources in `dispose`.
 */
export interface InferenceEngine {
  /** Backend this engine is bound to. */
  readonly backend: BackendKind;

  /**
   * Load the model and perform a warm-up pass to amortize shader/graph
   * compilation. Idempotent; safe to await once before first use.
   */
  init(): Promise<void>;

  /**
   * Stream a completion token-by-token. The first yielded token marks TTFT.
   * Honors `options.signal` for cooperative cancellation.
   */
  generate(
    prompt: string,
    options?: GenerationOptions,
  ): AsyncIterable<GenerationToken>;

  /** Convenience wrapper that drains {@link generate} and returns metrics. */
  complete(prompt: string, options?: GenerationOptions): Promise<GenerationResult>;

  /** Release model, sessions, and device resources. Engine is unusable afterward. */
  dispose(): Promise<void>;
}
