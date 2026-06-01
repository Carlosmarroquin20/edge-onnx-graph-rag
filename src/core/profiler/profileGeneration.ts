/**
 * Generation profiler.
 *
 * Wraps a token stream and, as a pass-through, records a single-run
 * {@link ExecutionMetrics}: time-to-first-token, wall-clock, decode throughput,
 * emitted-step count, and (where the host exposes it) peak memory. The wrapped
 * stream yields the original tokens unchanged, so instrumentation adds only a
 * clock read per step; the streaming `generate()` path carries zero profiling
 * overhead unless explicitly wrapped here.
 *
 * Clocks and the memory sampler are injectable for deterministic testing.
 */

import type { BackendKind } from "../types/inference.js";
import type { GenerationToken } from "../types/inference.js";
import type { ExecutionMetrics } from "../types/metrics.js";

/** Resolves the host's peak resident memory in bytes, or `undefined` if unavailable. */
export type MemorySampler = () => Promise<number | undefined>;

export interface ProfileOptions {
  readonly backend: BackendKind;
  readonly modelId: string;
  /** Exact prompt token count (from the tokenizer), recorded verbatim. */
  readonly promptTokenCount: number;
  /** High-resolution monotonic clock in ms. Defaults to `performance.now`. */
  readonly clock?: () => number;
  /** Epoch clock in ms for the run timestamp. Defaults to `Date.now`. */
  readonly epochClock?: () => number;
  /** Peak-memory sampler invoked once at completion. Defaults to the UA API probe. */
  readonly sampleMemory?: MemorySampler;
}

export interface InstrumentedRun {
  /** The instrumented pass-through stream; must be fully consumed. */
  readonly tokens: AsyncIterable<GenerationToken>;
  /** Resolves with the run metrics once the stream completes (or aborts). */
  readonly metrics: Promise<ExecutionMetrics>;
}

/**
 * Best-effort peak-memory probe via `measureUserAgentSpecificMemory`, which is
 * gated on cross-origin isolation and exposed only by some browsers. Returns
 * `undefined` everywhere else (Node, non-isolated documents).
 */
export const sampleUserAgentMemory: MemorySampler = async () => {
  const perf = globalThis.performance as
    | (Performance & {
        measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
      })
    | undefined;
  if (
    globalThis.crossOriginIsolated === true &&
    perf !== undefined &&
    typeof perf.measureUserAgentSpecificMemory === "function"
  ) {
    try {
      const { bytes } = await perf.measureUserAgentSpecificMemory();
      return bytes;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

/**
 * Instruments a generation token stream. Iterate {@link InstrumentedRun.tokens}
 * to completion, then await {@link InstrumentedRun.metrics}. Throughput is
 * computed over the decode phase only (wall-clock minus TTFT), so prefill cost
 * is attributed to TTFT rather than tokens/sec.
 */
export function profileGeneration(
  source: AsyncIterable<GenerationToken>,
  options: ProfileOptions,
): InstrumentedRun {
  const clock = options.clock ?? (() => performance.now());
  const epochClock = options.epochClock ?? (() => Date.now());
  const sampleMemory = options.sampleMemory ?? sampleUserAgentMemory;

  let resolveMetrics: ((metrics: ExecutionMetrics) => void) | undefined;
  const metrics = new Promise<ExecutionMetrics>((resolve) => {
    resolveMetrics = resolve;
  });

  async function* instrument(): AsyncIterable<GenerationToken> {
    const startedAt = epochClock();
    const start = clock();
    let timeToFirstTokenMs = 0;
    let isFirst = true;
    let generatedTokenCount = 0;

    try {
      for await (const token of source) {
        if (isFirst) {
          timeToFirstTokenMs = clock() - start;
          isFirst = false;
        }
        generatedTokenCount += 1;
        yield token;
      }
    } finally {
      const wallClockMs = clock() - start;
      const peakMemoryBytes = await sampleMemory();
      const decodeSeconds =
        Math.max(wallClockMs - timeToFirstTokenMs, Number.EPSILON) / 1000;
      resolveMetrics?.({
        backend: options.backend,
        modelId: options.modelId,
        timeToFirstTokenMs,
        wallClockMs,
        tokensPerSecond: generatedTokenCount / decodeSeconds,
        promptTokenCount: options.promptTokenCount,
        generatedTokenCount,
        peakMemoryBytes,
        startedAt,
      });
    }
  }

  return { tokens: instrument(), metrics };
}
