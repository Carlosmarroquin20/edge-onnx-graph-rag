/**
 * Engine factory and backend negotiation.
 *
 * Selects a viable execution backend from a data-driven preference list filtered
 * by the host {@link CapabilityReport}, then constructs the corresponding
 * {@link InferenceEngine}. Selection logic is pure and DOM-independent so it can
 * be exercised in isolation; concrete backend construction is injected.
 */

import type {
  BackendKind,
  CapabilityReport,
  EngineConfig,
  InferenceEngine,
} from "../types/inference.js";
import { NoBackendAvailableError } from "../types/errors.js";
import { detectCapabilities } from "./capabilities.js";

/** Default backend preference: hardware acceleration first, portable fallback last. */
const DEFAULT_PREFERENCE: readonly BackendKind[] = ["webgpu", "wasm"];

/** Predicate determining whether a backend is viable under a capability report. */
const SUPPORT_PREDICATES: Readonly<
  Record<BackendKind, (report: CapabilityReport) => boolean>
> = {
  webgpu: (report) => report.isWebGpuAvailable,
  // WASM is always available as a baseline; SIMD/threads only affect performance.
  wasm: () => true,
};

/**
 * Constructs a concrete engine for a resolved backend. Implementations are
 * provided by the backend modules (Phase 1); injecting them keeps this factory
 * free of heavy `onnxruntime-web` / Transformers.js imports until needed.
 */
export type BackendConstructor = (
  config: EngineConfig,
  report: CapabilityReport,
) => InferenceEngine;

export interface EngineFactoryOptions {
  /** Ordered backend preference; defaults to WebGPU then WASM. */
  readonly preference?: readonly BackendKind[];
  /** Pre-computed report; if omitted the factory probes the host. */
  readonly report?: CapabilityReport;
}

/**
 * Pure selection step: returns the first preferred backend whose support
 * predicate passes, or `null` when none qualify.
 */
export function selectBackend(
  report: CapabilityReport,
  preference: readonly BackendKind[] = DEFAULT_PREFERENCE,
): BackendKind | null {
  for (const kind of preference) {
    if (SUPPORT_PREDICATES[kind](report)) {
      return kind;
    }
  }
  return null;
}

/**
 * Negotiates and instantiates an inference engine.
 *
 * Resolves the capability report (probing the host if not supplied), selects a
 * backend, and delegates to the matching registered constructor. Throws
 * {@link NoBackendAvailableError} only when no backend qualifies — which, given
 * the WASM baseline, indicates a non-viable host rather than a missing feature.
 */
export class EngineFactory {
  private readonly constructors: ReadonlyMap<BackendKind, BackendConstructor>;

  constructor(constructors: ReadonlyMap<BackendKind, BackendConstructor>) {
    this.constructors = constructors;
  }

  async create(
    config: EngineConfig,
    options: EngineFactoryOptions = {},
  ): Promise<InferenceEngine> {
    const report = options.report ?? (await detectCapabilities());
    const kind = selectBackend(report, options.preference);

    if (kind === null) {
      throw new NoBackendAvailableError(
        "No execution backend satisfied the host capability report.",
      );
    }

    const construct = this.constructors.get(kind);
    if (construct === undefined) {
      throw new NoBackendAvailableError(
        `Backend "${kind}" was selected but no constructor is registered.`,
      );
    }

    return construct(config, report);
  }
}
