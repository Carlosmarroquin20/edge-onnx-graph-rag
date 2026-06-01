# CLAUDE.md — Engineering Context Ledger

> Long-term memory for this repository. Read this file before any task to avoid
> context drift. Keep it terse, factual, and current. Update the **State Ledger**
> at the end of every working session.

---

## 1. Project Overview

**edge-onnx-graph-rag** is a zero-cost, fully client-side AI platform. Lightweight
transformer models execute directly in the browser via WebGPU (with a WASM
fallback), eliminating server-side inference cost. Inference is coupled to an
in-memory Knowledge Graph for Graph-RAG context retrieval, and instrumented by a
high-resolution execution profiler (TTFT, throughput, memory).

The system is a portfolio-grade demonstration of systems design, runtime
capability negotiation, and performance optimization — not a toy demo.

### Technical Stack

| Layer            | Technology                                                |
| ---------------- | --------------------------------------------------------- |
| Language         | TypeScript (strict, ES2022 target, ESM)                   |
| Inference RT     | `onnxruntime-web` (WebGPU EP → WASM EP fallback)           |
| Model pipeline   | `@huggingface/transformers` (Transformers.js v3)          |
| Acceleration     | WebGPU compute; WASM SIMD + threads (cross-origin isolated)|
| Knowledge Graph  | Custom in-memory adjacency-list store (no DB)             |
| Profiling        | `performance.now()`, `performance.measureUserAgentSpecificMemory`, PerformanceObserver |
| UI (Phase 4)     | Next.js (App Router) + React + Tailwind CSS               |
| Test runner      | Vitest                                                    |
| Build/bundler    | Next.js / Turbopack (UI), `tsc` for type-check gate       |

---

## 2. Commands

> Dependencies are declared in `package.json` but not yet installed. Run install
> before first use.

```bash
npm install              # install dependencies
npm run typecheck        # tsc --noEmit, strict gate (must pass before commit)
npm run lint             # ESLint over src/
npm run test             # Vitest unit suite
npm run test:watch       # Vitest watch mode
npm run dev              # Next.js dev server (Phase 4+)
npm run build            # production build
```

Single test file: `npm run test -- src/core/engine/capabilities.test.ts`

---

## 3. Code Style Guidelines

### TypeScript

- `strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`. No exceptions.
- No `any`. Use `unknown` at boundaries and narrow explicitly. No non-null `!`
  assertions outside tests; prove non-nullness with control flow.
- Public API surfaces are explicitly typed (parameters and return). Do not rely
  on inference for exported signatures.
- Prefer `type` for unions/shapes, `interface` for extensible contracts that an
  implementer fulfills (e.g. `InferenceEngine`).
- Use discriminated unions over boolean flags for runtime modes
  (e.g. `BackendKind`). Model illegal states as unrepresentable.
- `readonly` by default for data carried across module boundaries.

### Error Handling

- Throw typed errors extending a single `EngineError` base with a `code`
  discriminant; never throw bare strings.
- For recoverable capability negotiation (WebGPU unavailable), return a Result
  describing the fallback — do not throw. Throw only on unrecoverable faults
  (model load failure, corrupt tensor).
- No silent `catch {}`. Every catch either re-throws (wrapped) or records a
  diagnostic via the profiler/logger.

### Naming Conventions

- Files: `PascalCase.ts` for classes/factories, `camelCase.ts` for modules of
  functions, `kebab-case` for non-code assets.
- Types/interfaces/classes: `PascalCase`. Variables/functions: `camelCase`.
  Constants: `UPPER_SNAKE_CASE`. Generic params: `T`, `TNode`, descriptive when >1.
- Boolean names read as predicates: `isWebGpuAvailable`, `hasSharedArrayBuffer`.
- No abbreviations except established domain terms (TTFT, EP, RAG, GPU, WASM).

### Comments

- Professional, concise technical English. Document *why*, not *what*.
- No emojis, no conversational filler, no elementary explanations.
- JSDoc only on exported API; describe contracts, units, and invariants.

---

## 4. Architecture Blueprints

### 4.1 Inference Engine

```
                    ┌────────────────────┐
   model + prompt → │   EngineFactory    │ negotiates backend at runtime
                    └─────────┬──────────┘
                              │ CapabilityReport
                ┌─────────────┴─────────────┐
                ▼                           ▼
        ┌───────────────┐           ┌───────────────┐
        │ WebGpuBackend │  fallback │  WasmBackend  │
        └───────┬───────┘    ──→    └───────┬───────┘
                └────────────┬──────────────┘
                             ▼
                  InferenceEngine (interface)
        init() · generate() (async token stream) · dispose()
```

- `capabilities.ts` probes the runtime once and produces an immutable
  `CapabilityReport` (WebGPU adapter presence, WASM SIMD/threads, COI state).
- `EngineFactory` selects a backend from a priority list filtered by the report.
  Selection is data-driven and testable in isolation from the DOM.
- Each backend implements `InferenceEngine`. Generation yields tokens through an
  `AsyncIterable` so the profiler can timestamp first-token latency precisely.

### 4.2 Graph System (Phase 2)

- In-memory store: `Map<NodeId, GraphNode>` + adjacency `Map<NodeId, Set<EdgeId>>`.
- Directed/weighted edges; multi-hop traversal (BFS k-hop, weighted shortest
  path) for Graph-RAG context expansion.
- Entity extraction parses model output / source documents into nodes and edges.
- Optional per-node embedding vectors for hybrid graph + semantic retrieval.

### 4.3 Execution Profiler (Phase 3)

- Wraps generation to capture: TTFT (ms), tokens/sec, prompt vs. generation token
  counts, wall-clock, peak memory (where the API is exposed and COI is active).
- Emits a typed `ExecutionMetrics` record per run; aggregates across runs for the
  UI dashboard. Zero overhead when disabled.

---

## 5. State Ledger

> Update at the end of every session. Newest first.

### Accomplished
- Repository scaffolding: `package.json`, strict `tsconfig.json`, `.gitignore`
  (secrets/keys/model-artifact rules), `.env.example`.
- Planning docs: `CLAUDE.md` (this file), `ROADMAP.md`.
- Dependencies installed: `onnxruntime-web@1.26`, `@huggingface/transformers@3.8`.
- Phase 1 foundations:
  - Core type contracts: `InferenceEngine`, `ExecutionMetrics`, `GraphNode`,
    `GraphEdge`, supporting types and discriminated unions.
  - Runtime capability detection (`capabilities.ts`): WebGPU + WASM SIMD/threads
    + cross-origin-isolation probe producing an immutable `CapabilityReport`.
  - `EngineFactory`: data-driven backend negotiation with graceful WASM fallback.
- Phase 1 implementation:
  - `streaming.ts`: single-producer/consumer push-to-pull `AsyncIterable` bridge.
  - `TransformersBackend` (abstract base): pipeline lifecycle, `TextStreamer`
    token streaming with one-step `isLast` lookahead, `AbortSignal` →
    `InterruptableStoppingCriteria` cancellation, token accounting, warm-up.
  - `WebGpuBackend` (device `webgpu`, dtype `q4`) and `WasmBackend`
    (device `wasm`, dtype `q8`, COI-gated thread-pool sizing).
  - `createEngine.ts` composition root pre-wiring both backends.
  - Vitest suite: 16 tests over capability detection + factory negotiation.
    `npm run typecheck` and `npx vitest run` both green.
- Phase 2 (graph core):
  - `GraphStore`: entity maps + dual adjacency indexes (outgoing/incoming),
    O(1) lookup, O(degree) `expand`, cascading node removal, endpoint integrity.
  - `traversal.ts`: `retrieveNeighborhood` (k-hop BFS, proximity-scored, bounded)
    and `weightedShortestPath` (Dijkstra over reciprocal weights, binary min-heap).
  - `ids.ts` (`asNodeId`/`asEdgeId`, `IdFactory`), `GraphError` discriminated codes.
  - `TraversalDirection` + `direction`/weight semantics added to graph contracts.
  - `contextAssembler.ts`: ranks/packs a `SubgraphResult` into a token-bounded
    block via an injectable `TokenEstimator` (char-heuristic default; the model's
    encoder can be supplied for exact budgeting). Score-ordered greedy admission;
    relations included only between admitted nodes; hard budget guarantee.
  - Vitest suite now 41 tests total; typecheck + `vitest run` green.

### Pending
- Phase 1: browser smoke test of an actual model end-to-end (WebGPU + WASM
  fallback); the unit suite covers negotiation/factory, not live inference.
- Phase 2: entity extraction (text/model output → nodes/edges) — the last piece
  before an end-to-end Graph-RAG path; optional embedding-based hybrid ranking
  over `GraphNode.embedding`.
- Integration: a `GraphRagPipeline` wiring extraction → retrieval → assembly →
  engine (prepend assembled context to the prompt).
- Phase 3: Execution profiler instrumentation and aggregation (authoritative
  token counts/peak memory; `complete()` currently approximates via re-tokenize).
- Phase 4: Next.js + Tailwind UI and metrics dashboard.
- Tooling: ESLint config (the `lint` script is declared but ESLint is not yet a
  dependency); COI response headers for the dev server to unlock WASM threads.

### Conventions Decided
- ESM-only, no CommonJS. `moduleResolution: "Bundler"`.
- Token streams modeled as `AsyncIterable<GenerationToken>`.
- Capability negotiation returns a Result; never throws for missing WebGPU.
