/**
 * Execution metrics contracts.
 *
 * High-resolution, low-overhead measurements captured per inference run and the
 * aggregate shape consumed by the profiling dashboard.
 */

import type { BackendKind } from "./inference.js";

/** Single-run profiler record. All durations in milliseconds, memory in bytes. */
export interface ExecutionMetrics {
  /** Backend that produced the run. */
  readonly backend: BackendKind;
  /** Model identifier the run executed against. */
  readonly modelId: string;

  /** Time to first token: dispatch until the first decoded token. */
  readonly timeToFirstTokenMs: number;
  /** Total wall-clock from dispatch to terminal token. */
  readonly wallClockMs: number;
  /** Decode throughput over the generation phase. */
  readonly tokensPerSecond: number;

  /** Tokens in the encoded prompt. */
  readonly promptTokenCount: number;
  /** Tokens produced during generation. */
  readonly generatedTokenCount: number;

  /**
   * Peak resident memory observed during the run, where the host exposes
   * `measureUserAgentSpecificMemory`; `undefined` otherwise.
   */
  readonly peakMemoryBytes: number | undefined;

  /** Epoch milliseconds at run start, for ordering and dashboard timelines. */
  readonly startedAt: number;
}

/** Cross-run aggregate for a fixed (backend, modelId) pair. */
export interface AggregatedMetrics {
  readonly backend: BackendKind;
  readonly modelId: string;
  readonly runCount: number;
  readonly ttftP50Ms: number;
  readonly ttftP95Ms: number;
  readonly meanTokensPerSecond: number;
  readonly peakMemoryBytes: number | undefined;
}
