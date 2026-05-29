# ROADMAP — edge-onnx-graph-rag

A modular, phase-by-phase blueprint from core runtime infrastructure to the
profiled UI. Each phase has explicit deliverables, exit criteria, and the
performance concern it exists to demonstrate. Phases are sequential in
dependency but internally decomposable for parallel work.

---

## Guiding Principles

1. **Runtime negotiation over assumption.** Capabilities (WebGPU, WASM SIMD,
   threads, cross-origin isolation) are probed at runtime; the system adapts
   rather than failing.
2. **Measure everything.** No optimization claim ships without profiler numbers.
3. **Zero backend cost.** All inference and retrieval run in the client.
4. **Strict typing as a design tool.** Illegal states are unrepresentable.

---

## Phase 0 — Foundations (current)

**Goal:** Scaffolding, contracts, and runtime capability negotiation.

- Strict `tsconfig.json`, `package.json`, `.gitignore`.
- `CLAUDE.md` context ledger and this roadmap.
- Core type contracts: `InferenceEngine`, `ExecutionMetrics`, `GraphNode`,
  `GraphEdge`.
- `capabilities.ts` runtime probe → immutable `CapabilityReport`.
- `EngineFactory` backend negotiation with WASM fallback.

**Exit criteria:** `npm run typecheck` passes; factory selects a backend kind
from a mocked capability report without touching the DOM.

---

## Phase 1 — Local Inference Engine

**Goal:** Execute a lightweight model end-to-end in the browser with a streaming
token interface.

**Performance concern:** backend selection, model warm-up, first-token latency.

- `WebGpuBackend`: bind `onnxruntime-web` WebGPU execution provider; manage
  session lifecycle and GPU buffer reuse.
- `WasmBackend`: WASM EP with SIMD + multi-threading where COI permits.
- Model acquisition via Transformers.js pipeline; tokenizer integration.
- `generate()` as `AsyncIterable<GenerationToken>` to expose TTFT precisely.
- Warm-up pass and session caching to amortize compilation cost.
- Vitest coverage for capability negotiation and factory selection.

**Exit criteria:** A quantized model produces a streamed completion on WebGPU,
falls back to WASM when WebGPU is absent, and `dispose()` releases resources.

---

## Phase 2 — In-Memory Knowledge Graph Core

**Goal:** Graph-RAG retrieval substrate with no external database.

**Performance concern:** adjacency representation, traversal cost, memory footprint.

- Store: `Map<NodeId, GraphNode>` + adjacency `Map<NodeId, Set<EdgeId>>`;
  directed, weighted edges.
- Entity-extraction parser: source text / model output → typed nodes and edges.
- Traversal algorithms: k-hop BFS, weighted shortest path, neighborhood expansion
  for context assembly.
- Optional per-node embedding vectors for hybrid structural + semantic ranking.
- Context-window assembler: rank and pack retrieved subgraph into the prompt
  budget.

**Exit criteria:** Given a document corpus, the graph answers multi-hop
neighborhood queries and emits a bounded context block consumable by Phase 1.

---

## Phase 3 — Execution Profiler & Metrics

**Goal:** High-resolution, low-overhead instrumentation of every inference run.

**Performance concern:** accurate latency/throughput attribution; memory tracking.

- Instrument generation to capture `ExecutionMetrics`: TTFT, tokens/sec, prompt
  vs. generation token counts, wall-clock, peak memory.
- `performance.now()` timing, PerformanceObserver marks, and
  `measureUserAgentSpecificMemory` where exposed.
- Per-run records plus cross-run aggregation (p50/p95 latency, mean throughput).
- Zero measurable overhead when profiling is disabled.

**Exit criteria:** Each run yields a typed metrics record; aggregates are queryable
for the dashboard; overhead is negligible when off.

---

## Phase 4 — Front-end Layout & Profiling UI

**Goal:** A modern, no-boilerplate interface surfacing inference, graph, and metrics.

**Performance concern:** non-blocking UI during inference; honest live metrics.

- Next.js (App Router) + React + Tailwind; no template cruft.
- Worker-offloaded inference to keep the main thread responsive; streamed tokens
  rendered incrementally.
- Live metrics dashboard: TTFT, tokens/sec, memory, backend in use.
- Knowledge-graph visualization of the retrieved subgraph.
- Cross-origin isolation headers configured to unlock WASM threads.

**Exit criteria:** End-to-end flow in the browser — prompt → graph retrieval →
streamed generation → live profiler readout — with backend transparency.

---

## Cross-Cutting Concerns

- **Memory management:** explicit `dispose()` lifecycles; GPU buffer and WASM heap
  reuse; bounded graph and context sizes.
- **Resilience:** graceful degradation across capability tiers; typed errors.
- **Testability:** runtime probes injectable/mockable; logic decoupled from DOM.
- **Reproducibility:** pinned model revisions; deterministic generation options
  for benchmarking.
