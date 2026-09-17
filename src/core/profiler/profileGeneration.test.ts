import { describe, expect, it } from "vitest";

import { profileGeneration, type ProfileOptions } from "./profileGeneration.js";
import type { GenerationToken } from "../types/inference.js";

async function* tokenStream(count: number): AsyncIterable<GenerationToken> {
  for (let index = 0; index < count; index += 1) {
    yield { text: `t${index}`, index, isLast: index === count - 1 };
  }
}

/** Clock that returns the scripted timestamps in order. */
function scriptedClock(values: ReadonlyArray<number>): () => number {
  let cursor = 0;
  return () => {
    const value = values[cursor] ?? values[values.length - 1] ?? 0;
    cursor += 1;
    return value;
  };
}

function options(overrides: Partial<ProfileOptions> = {}): ProfileOptions {
  return {
    backend: "wasm",
    modelId: "test-model",
    promptTokenCount: 7,
    epochClock: () => 1000,
    sampleMemory: async () => undefined,
    ...overrides,
  };
}

describe("profileGeneration", () => {
  it("yields the source tokens unchanged", async () => {
    const run = profileGeneration(tokenStream(3), options());

    const collected: string[] = [];
    for await (const token of run.tokens) {
      collected.push(token.text);
    }

    expect(collected).toEqual(["t0", "t1", "t2"]);
  });

  it("measures TTFT, wall-clock, throughput and counts", async () => {
    // clock() calls: start, first-token, wall.
    const run = profileGeneration(tokenStream(3), {
      ...options(),
      clock: scriptedClock([0, 10, 60]),
    });

    for await (const _token of run.tokens) {
      // drain
    }
    const metrics = await run.metrics;

    expect(metrics.timeToFirstTokenMs).toBe(10);
    expect(metrics.wallClockMs).toBe(60);
    expect(metrics.generatedTokenCount).toBe(3);
    expect(metrics.promptTokenCount).toBe(7);
    // Throughput over the 50ms decode phase: 3 / 0.05.
    expect(metrics.tokensPerSecond).toBeCloseTo(60);
    expect(metrics.startedAt).toBe(1000);
    expect(metrics.backend).toBe("wasm");
  });

  it("prefers the backend's exact token count over the emitted-delta count", async () => {
    async function* stream(): AsyncIterable<GenerationToken> {
      yield { text: "a", index: 0, isLast: false };
      // Two deltas emitted, but the terminal delta reports 5 exact tokens (e.g.
      // buffered multi-token code points plus a text-free EOS step).
      yield { text: "bc", index: 1, isLast: true, generatedTokenCount: 5 };
    }
    const run = profileGeneration(stream(), {
      ...options(),
      clock: scriptedClock([0, 10, 60]),
    });

    for await (const _token of run.tokens) {
      // drain
    }
    const metrics = await run.metrics;

    expect(metrics.generatedTokenCount).toBe(5); // exact, not the 2 emitted deltas
    expect(metrics.tokensPerSecond).toBeCloseTo(100); // 5 / 0.05s decode phase
  });

  it("records the sampled peak memory", async () => {
    const run = profileGeneration(tokenStream(1), {
      ...options(),
      sampleMemory: async () => 4096,
    });

    for await (const _token of run.tokens) {
      // drain
    }

    expect((await run.metrics).peakMemoryBytes).toBe(4096);
  });

  it("handles an empty stream with zero throughput", async () => {
    const run = profileGeneration(tokenStream(0), {
      ...options(),
      clock: scriptedClock([0, 5]),
    });

    for await (const _token of run.tokens) {
      // drain
    }
    const metrics = await run.metrics;

    expect(metrics.generatedTokenCount).toBe(0);
    expect(metrics.timeToFirstTokenMs).toBe(0);
    expect(metrics.tokensPerSecond).toBe(0);
  });
});
