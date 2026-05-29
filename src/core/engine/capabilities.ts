/**
 * Runtime capability negotiation.
 *
 * Probes the host once to determine which execution backends are viable.
 * Designed to be DOM-injectable: every global it reads is accepted through
 * {@link ProbeEnvironment} so the logic is unit-testable without a browser.
 */

import type { CapabilityReport } from "../types/inference.js";

/**
 * Minimal subset of host globals the probe depends on. Supplying this allows
 * tests to drive negotiation deterministically.
 */
export interface ProbeEnvironment {
  readonly gpu?: Pick<GPU, "requestAdapter"> | undefined;
  readonly hasSharedArrayBuffer: boolean;
  readonly isCrossOriginIsolated: boolean;
  readonly hardwareConcurrency: number | undefined;
}

/**
 * Detects WASM SIMD support by validating a minimal module that uses a SIMD
 * opcode. `WebAssembly.validate` is synchronous and side-effect free.
 */
function detectWasmSimd(): boolean {
  if (typeof WebAssembly === "undefined") {
    return false;
  }
  // Smallest valid module containing a `v128.const` (SIMD) instruction.
  const simdProbe = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60,
    0x00, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00,
    0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b,
  ]);
  try {
    return WebAssembly.validate(simdProbe);
  } catch {
    return false;
  }
}

/**
 * Reads ambient host globals into a {@link ProbeEnvironment}. Guards every
 * access so it is safe to call in worker, SSR, and undefined-global contexts.
 */
export function readHostEnvironment(): ProbeEnvironment {
  const gpu =
    typeof navigator !== "undefined" && "gpu" in navigator
      ? (navigator as Navigator & { gpu?: GPU }).gpu
      : undefined;

  const isCrossOriginIsolated =
    typeof globalThis !== "undefined" &&
    globalThis.crossOriginIsolated === true;

  const hardwareConcurrency =
    typeof navigator !== "undefined" &&
    typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : undefined;

  return {
    gpu,
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    isCrossOriginIsolated,
    hardwareConcurrency,
  };
}

/**
 * Produces an immutable {@link CapabilityReport} for the given environment.
 * The WebGPU probe is asynchronous because adapter acquisition is async; all
 * other checks are synchronous.
 */
export async function detectCapabilities(
  env: ProbeEnvironment = readHostEnvironment(),
): Promise<CapabilityReport> {
  let isWebGpuAvailable = false;
  if (env.gpu !== undefined) {
    try {
      const adapter = await env.gpu.requestAdapter();
      isWebGpuAvailable = adapter !== null;
    } catch {
      // Adapter request can throw on blocklisted or sandboxed devices; treat
      // as unavailable rather than propagating — fallback handles it.
      isWebGpuAvailable = false;
    }
  }

  const hasWasmSimd = detectWasmSimd();
  const hasWasmThreads = env.hasSharedArrayBuffer && env.isCrossOriginIsolated;

  return Object.freeze({
    isWebGpuAvailable,
    hasWasmSimd,
    hasWasmThreads,
    isCrossOriginIsolated: env.isCrossOriginIsolated,
    hardwareConcurrency: env.hardwareConcurrency,
  });
}
