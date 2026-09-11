# edge-onnx-graph-rag

Zero-cost, fully client-side Graph-RAG. Lightweight transformer models execute
in the browser via WebGPU (with a WASM fallback) over an in-memory knowledge
graph, instrumented by a high-resolution execution profiler. No server-side
inference; nothing leaves the browser.

See [`CLAUDE.md`](CLAUDE.md) for the engineering ledger and [`ROADMAP.md`](ROADMAP.md)
for the phase plan.

## Highlights

- **Runtime backend negotiation** — WebGPU (4-bit weights) with a graceful WASM
  fallback (8-bit); each backend applies its own precision default. A UI selector
  can pin **Auto / WebGPU / WASM** to compare them on the same device.
- **In-memory knowledge graph** — adjacency-list store, k-hop / weighted-shortest-path
  traversal, dependency-free entity extraction, and token-bounded context assembly.
- **Worker-offloaded inference** — the engine, model load, and token decoding run
  in a Web Worker; the main thread stays responsive and only builds the prompt
  and renders streamed tokens.
- **Live execution profiler** — measured TTFT, throughput, wall-clock, prompt/gen
  counts, and (where the API is exposed) peak memory, aggregated per backend/model.
- **Retrieved-subgraph visualization** — the neighborhood behind each answer is
  drawn as an interactive graph (deterministic force layout, seeds highlighted,
  neighborhood highlight on hover).
- **Real model-download progress**, streamed answers, and cross-origin isolation
  for WASM threads.

## Architecture

```
text / model output ─► extraction ─► GraphBuilder ─► GraphStore
                                                          │
        query ─► seed resolution ─► retrieveNeighborhood ─► assembleContext
                                                          │
                             promptTemplate ─► InferenceEngine ─► answer + metrics
                                                          │
                                            retrieved subgraph ─► visualization
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
  Inference runs in a **Web Worker** (`lib/inference.worker.ts`): the engine,
  model load, and token decoding stay off the main thread; the main thread only
  builds the prompt (retrieval + assembly) and renders streamed tokens. The
  worker is fronted by `WorkerEngineClient`, which implements `InferenceEngine`
  so the pipeline is agnostic to the thread boundary. The retrieved subgraph is
  laid out by a pure, deterministic function (`lib/subgraphLayout.ts`) and drawn
  as inline SVG (`components/SubgraphGraph.tsx`).

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit, strict
npm run lint        # ESLint
npm run test        # Vitest unit suite (DOM-free; runs without a browser)
npm run dev         # Next.js dev server → http://localhost:3000
npm run build       # production build
```

## Running the UI

```bash
npm run dev
```

Open the app, edit the knowledge source (triples or free text), click **Build
graph**, optionally pin an execution backend, enter a query, and **Ask**. The
first ask downloads and caches the model weights in the browser, negotiates a
backend, then streams the answer while the profiler reports TTFT, throughput, and
(where available) peak memory. The subgraph that grounded the answer is drawn
beside it.

### Cross-origin isolation

WASM multi-threading and `SharedArrayBuffer` require cross-origin isolation. The
dev/prod server sets `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless` (see [`next.config.mjs`](next.config.mjs)).
Without isolation the WASM backend falls back to single-threaded execution.

## Status

The client-side core is complete and unit-tested (**109 tests**, strict type-check
and lint clean). End-to-end inference has been exercised in a real browser on
**both backends**: WebGPU (4-bit) and the WASM fallback (8-bit) each load a live
model, stream a grounded answer, and report measured profiler metrics.

`next build` succeeds; the ONNX/Transformers.js runtime loads lazily in a separate
chunk (in the worker), never on first paint or during SSR. `next.config.mjs` flags
`onnxruntime-web`'s pre-minified worker bundles as already minimized so Terser
skips them (they use `import.meta`, which Terser rejects when re-minifying ESM
assets as non-modules).

## License

MIT — see [`LICENSE`](LICENSE).
