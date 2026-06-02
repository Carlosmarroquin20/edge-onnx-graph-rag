# edge-onnx-graph-rag

Zero-cost, fully client-side Graph-RAG. Lightweight transformer models execute
in the browser via WebGPU (with a WASM fallback) over an in-memory knowledge
graph, instrumented by a high-resolution execution profiler. No server-side
inference; nothing leaves the browser.

See [`CLAUDE.md`](CLAUDE.md) for the engineering ledger and [`ROADMAP.md`](ROADMAP.md)
for the phase plan.

## Architecture

```
text / model output ─► extraction ─► GraphBuilder ─► GraphStore
                                                          │
        query ─► seed resolution ─► retrieveNeighborhood ─► assembleContext
                                                          │
                             promptTemplate ─► InferenceEngine ─► answer + metrics
```

- **Engine** (`src/core/engine`) — runtime capability negotiation (WebGPU → WASM),
  a backend-agnostic `InferenceEngine`, and Transformers.js-backed backends with
  streamed token generation.
- **Graph** (`src/core/graph`) — adjacency-list store, k-hop / weighted-path
  traversal, dependency-free entity extraction, token-bounded context assembly.
- **Pipeline** (`src/core/pipeline`) — `GraphRagPipeline` composing the above;
  depends only on the `InferenceEngine` contract.
- **Profiler** (`src/core/profiler`) — TTFT / throughput / memory instrumentation
  and cross-run aggregation.
- **UI** (`app`, `components`, `lib`) — Next.js App Router + Tailwind console.

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit, strict
npm run test        # Vitest unit suite (core; runs without a browser)
npm run dev         # Next.js dev server → http://localhost:3000
npm run build       # production build (see caveat below)
```

## Running the UI

```bash
npm run dev
```

Open the app, edit the knowledge source (triples or free text), click **Build
graph**, enter a query, and **Ask**. The first ask downloads and caches the model
weights in the browser, negotiates a backend, then streams the answer while the
profiler reports TTFT, throughput, and (where available) peak memory.

### Cross-origin isolation

WASM multi-threading and `SharedArrayBuffer` require cross-origin isolation. The
dev/prod server sets `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless` (see [`next.config.mjs`](next.config.mjs)).
Without isolation the WASM backend falls back to single-threaded execution.

## Status

The client-side core is complete and unit-tested (70 tests, strict type-check
clean); `npm run dev` compiles and renders. Two items remain:

- **Production build (`npm run build`)** currently fails in Terser minification of
  `onnxruntime-web`'s worker bundle (`'import.meta' cannot be used outside of
  module code`) — a known ORT-web/webpack interaction. Development is unaffected
  (the dev server does not run Terser). Tracked in `CLAUDE.md`.
- **Live end-to-end inference** (real model on WebGPU/WASM) must be exercised in a
  browser; the unit suite covers everything up to the `InferenceEngine` contract.
