import { GraphRagConsole } from "../components/GraphRagConsole.js";

export default function Page(): React.ReactElement {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          edge-onnx-graph-rag
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Client-side Graph-RAG · in-browser ONNX inference (WebGPU → WASM) over an
          in-memory knowledge graph · live execution profiling. Nothing leaves the
          browser.
        </p>
      </header>
      <GraphRagConsole />
    </main>
  );
}
