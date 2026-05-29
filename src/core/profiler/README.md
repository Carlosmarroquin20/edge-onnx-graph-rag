# Execution Profiler (Phase 3)

Low-overhead instrumentation of inference runs. Contracts live in
`../types/metrics.ts`.

Planned modules:
- `RunProfiler` — wraps a generation stream; captures TTFT, throughput, token
  counts, wall-clock, and peak memory into an `ExecutionMetrics` record.
- `metricsAggregator` — cross-run p50/p95 latency and mean throughput.

Timing via `performance.now()` and PerformanceObserver; memory via
`measureUserAgentSpecificMemory` where exposed and cross-origin isolation is
active. Zero overhead when disabled. Not yet implemented.
