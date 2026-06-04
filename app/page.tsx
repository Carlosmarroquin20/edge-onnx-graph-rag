import { GraphRagConsole } from "../components/GraphRagConsole.js";

const CAPABILITIES = [
  "100% in-browser",
  "WebGPU → WASM",
  "Graph-RAG",
  "Zero backend",
  "Live profiling",
];

export default function Page(): React.ReactElement {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10 lg:py-14">
      <header className="mb-10 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-50">
          edge-onnx-graph-rag
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-neutral-400">
          A lightweight language model runs <span className="text-neutral-200">entirely in your browser</span>{" "}
          (WebGPU, falling back to WASM), answering over an in-memory knowledge
          graph. Every run is profiled live — time-to-first-token, throughput,
          and memory. Nothing leaves this tab.
        </p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {CAPABILITIES.map((label) => (
            <li
              key={label}
              className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 font-mono text-[11px] tracking-wide text-neutral-400"
            >
              {label}
            </li>
          ))}
        </ul>
      </header>
      <GraphRagConsole />
    </main>
  );
}
