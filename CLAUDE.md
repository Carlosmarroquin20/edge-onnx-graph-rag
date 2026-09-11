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
  - `extraction.ts`: dependency-free entity extraction — `extractTriples`
    (model-output `subject | predicate | object` lines → directed edges) and
    `extractByCooccurrence` (Unicode proper-noun detection + sentence
    co-occurrence → undirected edges, stopword-filtered).
  - `GraphBuilder.ts`: ingests `ExtractionResult` into a `GraphStore`; owns id
    minting, label de-duplication (normalized key), and edge-weight accumulation
    (orientation-folded signature for undirected relations).
  - Vitest suite now 55 tests total; typecheck + `vitest run` green.
- Integration (`src/core/pipeline/`):
  - `GraphRagPipeline`: composes seed resolution → k-hop retrieval → context
    assembly → prompt augmentation → engine generation. Depends only on the
    `InferenceEngine` contract (testable with a stub; no model load). `prepare()`
    is the engine-pure retrieval side; `run()` returns answer + metrics;
    `stream()` exposes the answer as a token stream. Injectable `SeedResolver`
    and `PromptTemplate`; defaults `resolveSeedsByLabel` (proper-noun → node
    label match) and `defaultPromptTemplate` (graceful context-free degradation).
  - Vitest suite now 61 tests total; typecheck + `vitest run` green.
- Phase 3 (execution profiler, `src/core/profiler/`):
  - `profileGeneration`: pass-through stream instrument resolving an
    `ExecutionMetrics` (TTFT, wall-clock, decode throughput, emitted-step count,
    exact prompt-token count, peak memory). Injectable clocks + memory sampler.
  - `sampleUserAgentMemory`: COI-gated `measureUserAgentSpecificMemory` probe.
  - `MetricsAggregator`: per-`(backend, modelId)` aggregation — run count,
    nearest-rank p50/p95 TTFT, mean throughput, peak memory.
  - `TransformersBackend.complete` now derives metrics from `profileGeneration`
    over its own stream (measured timing/counts; re-tokenize approximation gone;
    prompt count still exact).
  - Vitest suite now 70 tests total; typecheck + `vitest run` green.
- Phase 4 (Next.js + Tailwind UI):
  - App Router scaffold: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`;
    Tailwind + PostCSS; `next.config.mjs`; tsconfig extended for JSX (`preserve`,
    `allowJs`, include `app`/`components`/`lib`).
  - `next.config.mjs`: COI headers (COOP `same-origin` + COEP `credentialless`);
    webpack `extensionAlias` so the core's `.js` specifiers resolve to `.ts`;
    `onnxruntime-node`/`sharp` aliased to `false` (browser uses onnxruntime-web);
    node-core fallbacks off; a `processAssets` plugin flags onnxruntime-web's
    pre-minified `ort*.mjs` bundles as `minimized` so Terser skips them (they use
    `import.meta`, which Terser rejects when re-minifying ESM assets).
  - `lib/graphRagClient.ts` (`GraphRagSession`): builds the graph from text, lazily
    + dynamically imports the engine (no transformers eval during SSR), streams a
    turn, instruments it via `profileGeneration`, aggregates metrics.
  - `lib/useGraphRag.ts`: React hook projecting the session into render state
    (phase, status, streamed answer, outcome, aggregates); `AbortController` cancel.
  - `components/`: `GraphRagConsole` (client), `MetricsPanel`, `SubgraphPanel`.
  - Verified here: full-repo `tsc --noEmit` clean; 70 core tests still green;
    `next dev` compiles and SSR-renders the page (HTTP 200);
    `next build` succeeds (route `/` ~8 kB, ~95 kB First Load JS — the
    ONNX/Transformers runtime is in a lazily-loaded chunk, not first load).
- Phase 4 — A1, worker-offloaded inference (`lib/`):
  - `inference.worker.ts`: a module worker that owns the `InferenceEngine` (via
    `createInferenceEngine`); capability negotiation + model load + decoding run
    off the main thread. The heavy runtime bundles into the worker chunk alone.
  - `workerProtocol.ts`: typed request/response message unions (init/generate/
    cancel/dispose ↔ ready/token/done/error). Only cloneable data crosses;
    cancellation is a `cancel` message keyed by `requestId` (no `AbortSignal`).
  - `workerEngineClient.ts` (`WorkerEngineClient implements InferenceEngine`):
    main-thread proxy reconstructing token streams via `createPushPullStream`
    and relaying `AbortSignal` → `cancel`. Drop-in for `GraphRagPipeline`, which
    is unchanged — retrieval/assembly stay on the main thread, only generation
    crosses to the worker.
  - `GraphRagSession.ensureEngine` now spins up a `WorkerEngineClient`; the main
    bundle no longer pulls Transformers.js (it lives only in the worker chunk).
  - Verified: `tsc` clean; 70 tests green; `next build` succeeds; `next dev`
    compiles (600 modules) and renders (HTTP 200).
- Phase 4 — A2/A3, engine/worker lifecycle hardening (`lib/`):
  - A2: `GraphRagSession.ask` rejects overlapping turns (the pipeline is not
    reentrant); exposes `isGenerating`.
  - A3: `useGraphRag` terminates the worker on unmount (frees model/GPU/WASM);
    `ensureEngine` no longer caches a failed load (clears the promise and tears
    down the worker so the next attempt retries cleanly).
  - Verified: `tsc` clean; 70 tests green; `next build` succeeds.
- Phase 4 — S3, model-id input validation (`lib/`):
  - `modelId.ts` (`validateModelId`): constrains the user-supplied model id to a
    HF-style repo id; rejects URLs/protocol-relative, path traversal (`..`),
    backslashes, whitespace, >1 `/`, out-of-charset, and over-length. Pure +
    unit-tested (`lib/modelId.test.ts`; vitest `include` now covers `lib/`).
  - `GraphRagSession` validates in its constructor and `setModel` (an invalid id
    can never reach the loader); `GraphRagConsole` shows inline feedback and
    disables Ask on an invalid id; `useGraphRag.setModel` surfaces the reason.
  - Verified: `tsc` clean; 80 tests green (70 core + 10 validator); `next build`
    succeeds.
- Test hardening (R2): direct coverage for `createPushPullStream` (buffer/park
  ordering, FIFO, close, fail/drain, post-close ignore, consumer `return`) — the
  push-to-pull bridge underlying both `TransformersBackend` and
  `WorkerEngineClient` streaming — plus a `contextAssembler` header-overflow edge.
  Suite now 90 tests; `tsc` + `vitest run` green.
- Perf (P1): seed resolution no longer rebuilds the label index per query.
  `GraphRagPipeline` now exposes `buildLabelIndex` + `resolveSeedsFromIndex`
  (the default `resolveSeedsByLabel` composes them); `GraphRagSession` builds the
  index once in `buildGraph` and injects an index-backed `resolveSeeds` into the
  pipeline, so repeated queries over a stable graph are O(mentions), not O(nodes).
  Suite now 93 tests; `tsc` + `vitest run` + `next build` green.
- Error discipline (R3): `profiler/errors.ts` adds `ProfilerError` (code
  discriminant, mirrors `EngineError`/`GraphError`); `MetricsAggregator` throws
  it instead of a bare `Error` for the empty-aggregate guard. Suite now 95 tests.
- Tooling (T1/T2):
  - ESLint installed: flat config (`eslint.config.mjs`, ESLint 9 +
    typescript-eslint recommended, non-type-checked); `lint` script now `eslint .`
    with `.next`/`dist`/`next-env.d.ts` ignored and the `^_` unused-binding
    convention allowed. `npm run lint` passes clean (zero findings).
  - CI (`.github/workflows/ci.yml`): on push to `main` + PRs, runs `npm ci` then
    typecheck → lint → test → build on Node 20. All four steps verified locally.
- UI/UX pass (visual; not yet browser-verified):
  - Theme: `font-sans` for UI/prose, `font-mono` reserved for data (metrics,
    retrieved context, model id); subtle top emerald glow; emerald selection;
    `focus-visible` rings on all controls.
  - Layout: results column widened (`lg:grid-cols-5`, inputs 2 / results 3) so
    the metrics "wow" dominates; numbered step headers (①②③) for the
    Build → Model → Ask flow.
  - Model-loading state: dedicated card (spinner + "first run downloads weights,
    cached afterwards") distinct from the streaming caret; Ask button label
    tracks phase (Loading…/Generating…/Ask the graph) with `aria-busy`.
  - `MetricsPanel`: hero stats (throughput, TTFT) + WebGPU/WASM backend badge;
    secondary stat grid; mono/tabular-nums table.
  - a11y: `aria-label`s on inputs, `role="status"`/`aria-live` on status+answer,
    `role="alert"` on errors, `aria-invalid` on the model id.
  - Verified: `tsc` + `lint` clean; `next build` succeeds and prerenders `/`
    statically. Visual polish pending a browser session.
- U1 — real model-download progress (end-to-end):
  - Contract: `ModelLoadProgress`/`ProgressListener` added to `types/inference`;
    `InferenceEngine.init(onProgress?)`. `TransformersBackend.init` maps
    Transformers.js `progress_callback` (`ProgressInfo`) → the clone-safe
    `ModelLoadProgress`.
  - Worker: a `progress` response added to `workerProtocol`; the worker forwards
    `engine.init` progress; `WorkerEngineClient.init(onProgress?)` relays it to
    the main thread.
  - `lib/loadProgress.ts` (`DownloadAggregator`): folds per-file byte events into
    one overall percent (capped <100 until `ready`); pure + unit-tested
    (`loadProgress.test.ts`).
  - `GraphRagSession.ask`/`ensureEngine` thread `onProgress`; `useGraphRag` feeds
    the aggregator into a `download` state; `GraphRagConsole` renders a real
    progress bar (percent + current file) in the loading card, falling back to an
    indeterminate spinner on a cache hit (no byte totals).
  - Verified: `tsc` + `lint` clean; 100 tests green (+5 aggregator); `next build`
    succeeds.
- Live smoke test — first real model run in-browser (closes the Phase 1 gap):
  - Ran `onnx-community/Qwen2.5-0.5B-Instruct` (q4) end-to-end via `next dev` in
    a real browser: the WebGPU EP was negotiated and selected (q4 weights fetched,
    not the WASM q8 path), weights downloaded off the main thread in the worker
    with the U1 progress bar advancing on real bytes, tokens streamed, and the
    profiler emitted measured figures (TTFT ~1.3–4.7 s, 2.7–7.0 tok/s, ~209 gen
    steps; peak memory `n/a` — `measureUserAgentSpecificMemory` not exposed here).
  - Bug found + fixed (`lib/useGraphRag.ts`): the initial graph is built once
    behind a `didInit` component ref, while the hook's unmount cleanup nulls the
    session (`sessionRef`) and disposes the worker. Under React StrictMode (dev)
    the simulated remount left `didInit=true` with `sessionRef=null`, so the next
    lazily-created session started EMPTY while the UI still read "5 nodes" —
    retrieval resolved zero seeds and the model answered context-free ("no
    information available"). Fix: session creation is now self-healing —
    `useGraphRag` records the last-built `{source, mode}` in a ref and
    `getSession` replays it into any freshly created session, so a recreated
    session inherits the graph instead of starting empty. Verified in-browser: the
    same query now resolves seeds (Ada Lovelace, Charles Babbage), assembles a
    5-node / 96-tok context block, and the answer is grounded in the triples.
  - No unit test added: the fix is React-hook-lifecycle-specific and the suite is
    deliberately node-only (no jsdom/testing-library) — validated by the live run.
    `tsc` + `lint` clean; 100 tests green.
  - (WASM path verified later — see the backend-selector entry below.)
- CI hardening (merged via PR #1): the Windows-generated `package-lock.json`
  records only win32 Rollup binaries as package nodes, so `npm ci` on the Linux
  runner exited 0 without the Linux binary and vitest then failed to load
  `@rollup/rollup-linux-x64-gnu` (npm/cli#4828). The install step now resolves
  fresh against `package.json` on the runner. Follow-ups: commit a cross-platform
  lockfile; bump the workflow off deprecated Node 20.
- Subgraph visualization (Phase 4 exit criterion — closes the last Phase 4 gap):
  - Plumbing: `PreparedQuery` now also carries the retrieved `SubgraphResult`;
    `GraphRagSession.ask` surfaces it (plus seed node ids) on `AskOutcome`, so the
    UI can draw what retrieval actually returned. Retrieval stays on the main
    thread — nothing extra crosses the worker boundary.
  - `components/SubgraphGraph.tsx`: dependency-free, deterministic
    Fruchterman-Reingold layout (positions are a pure function of node/edge
    identity — no randomness, reproducible) rendered as inline SVG: directed vs.
    undirected relations with labels, nodes sized by relevance score, seed anchors
    highlighted (emerald + ring), and a hover interaction highlighting a node's
    incident edges/neighbors while dimming the rest. `!`-free per the core's
    array-access convention (guarded index reads, not non-null assertions).
  - `SubgraphPanel` renders the graph with seed badges above a collapsible
    "context block sent to the model" (the prior text view, demoted to secondary).
  - Verified in-browser (WebGPU, live model run): the Ada/Babbage subgraph draws
    with both seeds highlighted, hover dimming works, and it composes with the
    metrics readout. `tsc` + `lint` clean; 100 tests green.
- Backend selector + WASM fallback verified in-browser (closes the last live gap):
  - User-facing execution-backend choice (`Auto` / `WebGPU` / `WASM`) threaded
    UI → `useGraphRag` → `GraphRagSession` → `WorkerEngineClient` → worker →
    `EngineFactory` via a `preference` list. `Auto` keeps WebGPU→WASM negotiation;
    the explicit choices force one backend (forcing WebGPU on a host without it
    surfaces as an init error, not a silent fallback). Choice is replayed into any
    freshly created session (a ref, like the graph replay) and changing it disposes
    the current engine so the next turn re-negotiates.
  - Dropped the hard-coded `q4` dtype: the session sends no dtype, so each backend
    applies its own default (`WebGpuBackend` q4, `WasmBackend` q8). `init`'s
    `dtype` is now optional in the worker protocol; `preference` added alongside.
  - Verified live: forcing WASM negotiated to the WASM EP (fetched
    `onnx/model_quantized.onnx` — the q8 build — not `model_q4.onnx`), the
    download bar advanced, the model loaded ("Ready on WASM"), tokens streamed a
    grounded answer, and the profiler reported the WASM backend (TTFT ~2.2 s,
    2.4 tok/s, 92 gen steps; MetricsPanel WASM badge + aggregation row). The
    subgraph view renders identically (backend-agnostic).
  - `tsc` + `lint` clean; 100 tests green (worker/UI plumbing exercised in-browser,
    not unit-tested — the suite is node-only).
- Polish pass (README / LICENSE / layout tests):
  - `README.md` refreshed to current reality: highlights (backend selector,
    subgraph viz, worker offload, live profiler), an updated architecture diagram,
    a `lint` command, and a Status section stating 109 tests and both backends
    exercised live in-browser (the old README still claimed live inference was the
    one unrun item and cited 70 tests).
  - Added an MIT `LICENSE` (holder: the repo's GitHub handle — swap for a legal
    name if desired) and set `package.json` `"license": "MIT"`.
  - Extracted the subgraph force-layout into `lib/subgraphLayout.ts` (pure,
    dependency-free) and unit-tested it (`lib/subgraphLayout.test.ts`, +9):
    determinism, single-node centering, in-bounds/finite coordinates, endpoint
    separation, dangling-edge tolerance, and `radiusFor` interpolation.
    `SubgraphGraph.tsx` now consumes it and holds only rendering.
  - `vitest.config.ts` gained a `@core` → `src/core` resolve alias (mirrors the
    tsconfig path) so tests can import the core barrels as the app does.
  - `tsc` + `lint` clean; 109 tests green; `next build` succeeds.
- Optional: embedding-based hybrid ranking over `GraphNode.embedding`; semantic
  seed resolution to complement label matching in `resolveSeedsByLabel`;
  per-token emission for exact (vs. decode-step) generated-token counts.
- Tooling: optional type-aware ESLint (typescript-eslint `projectService`) for
  deeper rules; the current config is non-type-checked for speed.

### Conventions Decided
- ESM-only, no CommonJS. `moduleResolution: "Bundler"`.
- Token streams modeled as `AsyncIterable<GenerationToken>`.
- Capability negotiation returns a Result; never throws for missing WebGPU.
