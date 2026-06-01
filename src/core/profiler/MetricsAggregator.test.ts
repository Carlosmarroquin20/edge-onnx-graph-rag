import { describe, expect, it } from "vitest";

import { MetricsAggregator } from "./MetricsAggregator.js";
import type { BackendKind } from "../types/inference.js";
import type { ExecutionMetrics } from "../types/metrics.js";

function run(
  overrides: Partial<ExecutionMetrics> & Pick<ExecutionMetrics, "timeToFirstTokenMs">,
): ExecutionMetrics {
  return {
    backend: "wasm",
    modelId: "m",
    wallClockMs: 100,
    tokensPerSecond: 10,
    promptTokenCount: 5,
    generatedTokenCount: 20,
    peakMemoryBytes: undefined,
    startedAt: 0,
    ...overrides,
  };
}

describe("MetricsAggregator", () => {
  it("computes nearest-rank p50/p95 TTFT and mean throughput", () => {
    const aggregator = new MetricsAggregator();
    for (const ttft of [10, 20, 30, 40, 50]) {
      aggregator.add(run({ timeToFirstTokenMs: ttft, tokensPerSecond: ttft }));
    }

    const result = aggregator.get("wasm", "m");

    expect(result?.runCount).toBe(5);
    expect(result?.ttftP50Ms).toBe(30);
    expect(result?.ttftP95Ms).toBe(50);
    expect(result?.meanTokensPerSecond).toBeCloseTo(30);
  });

  it("reports the maximum peak memory across runs, ignoring unset samples", () => {
    const aggregator = new MetricsAggregator();
    aggregator.add(run({ timeToFirstTokenMs: 10, peakMemoryBytes: undefined }));
    aggregator.add(run({ timeToFirstTokenMs: 20, peakMemoryBytes: 2048 }));
    aggregator.add(run({ timeToFirstTokenMs: 30, peakMemoryBytes: 1024 }));

    expect(aggregator.get("wasm", "m")?.peakMemoryBytes).toBe(2048);
  });

  it("leaves peak memory undefined when no run reported it", () => {
    const aggregator = new MetricsAggregator();
    aggregator.add(run({ timeToFirstTokenMs: 10 }));

    expect(aggregator.get("wasm", "m")?.peakMemoryBytes).toBeUndefined();
  });

  it("segregates runs by backend and model", () => {
    const aggregator = new MetricsAggregator();
    const backends: BackendKind[] = ["wasm", "webgpu"];
    for (const backend of backends) {
      aggregator.add(run({ backend, timeToFirstTokenMs: 15 }));
    }
    aggregator.add(run({ modelId: "other", timeToFirstTokenMs: 15 }));

    expect(aggregator.groupCount).toBe(3);
    expect(aggregator.snapshot()).toHaveLength(3);
    expect(aggregator.get("webgpu", "m")?.runCount).toBe(1);
  });

  it("returns undefined for an unrecorded group", () => {
    expect(new MetricsAggregator().get("wasm", "missing")).toBeUndefined();
  });
});
