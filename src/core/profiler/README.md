# Execution Profiler (Phase 3)

Low-overhead instrumentation of inference runs. Contracts live in
`../types/metrics.ts`.

Implemented:
- `profileGeneration` — wraps a token stream as a pass-through and resolves an
  `ExecutionMetrics` on completion: TTFT, wall-clock, decode throughput,
  emitted-step count, exact prompt token count, and peak memory. Clocks and the
  memory sampler are injectable for deterministic tests; the streaming
  `generate()` path is untouched unless explicitly wrapped (zero overhead off).
- `sampleUserAgentMemory` — best-effort `measureUserAgentSpecificMemory` probe,
  gated on cross-origin isolation; returns `undefined` elsewhere.
- `MetricsAggregator` — groups runs by `(backend, modelId)` and reports
  `AggregatedMetrics`: run count, nearest-rank p50/p95 TTFT, mean throughput,
  and peak memory across runs.

`TransformersBackend.complete` now derives its metrics from `profileGeneration`
over its own stream, so token timing/throughput are measured rather than the
output being re-tokenized after the fact (prompt count remains exact).

Throughput is computed over the decode phase (wall-clock minus TTFT), attributing
prefill cost to TTFT.
