/**
 * Engine composition root.
 *
 * Registers the concrete backends with an {@link EngineFactory} and exposes a
 * single entry point for application code. Importing this module pulls in the
 * Transformers.js runtime; callers that only need capability negotiation should
 * depend on {@link EngineFactory} / {@link selectBackend} directly to avoid the
 * heavy dependency.
 */

import type {
  BackendKind,
  EngineConfig,
  InferenceEngine,
} from "../types/inference.js";
import {
  EngineFactory,
  type BackendConstructor,
  type EngineFactoryOptions,
} from "./EngineFactory.js";
import { WasmBackend } from "./backends/WasmBackend.js";
import { WebGpuBackend } from "./backends/WebGpuBackend.js";

const BACKEND_CONSTRUCTORS: ReadonlyMap<BackendKind, BackendConstructor> = new Map<
  BackendKind,
  BackendConstructor
>([
  ["webgpu", (config, report) => new WebGpuBackend(config, report)],
  ["wasm", (config, report) => new WasmBackend(config, report)],
]);

/** Factory pre-wired with every available backend. */
export const engineFactory = new EngineFactory(BACKEND_CONSTRUCTORS);

/**
 * Negotiates a backend against the host and constructs an engine. The returned
 * engine is not yet initialized; await `init()` before generation.
 */
export function createInferenceEngine(
  config: EngineConfig,
  options?: EngineFactoryOptions,
): Promise<InferenceEngine> {
  return engineFactory.create(config, options);
}
