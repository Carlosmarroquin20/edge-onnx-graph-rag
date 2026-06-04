import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "edge-onnx-graph-rag",
  description:
    "Zero-cost, fully client-side Graph-RAG: in-browser ONNX inference (WebGPU/WASM) over an in-memory knowledge graph, with live execution profiling.",
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
