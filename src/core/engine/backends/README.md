# Execution Backends

Concrete `InferenceEngine` implementations, instantiated by `EngineFactory`.

- `WebGpuBackend` — `onnxruntime-web` WebGPU execution provider (Phase 1).
- `WasmBackend` — WASM execution provider with SIMD + threads where the host is
  cross-origin isolated (Phase 1).

Both bind to a Transformers.js pipeline for tokenization and decoding, and expose
generation as an `AsyncIterable<GenerationToken>` so the profiler can timestamp
first-token latency. Not yet implemented.
