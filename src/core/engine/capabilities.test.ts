import { describe, expect, it } from "vitest";

import { detectCapabilities, type ProbeEnvironment } from "./capabilities.js";

function makeEnv(overrides: Partial<ProbeEnvironment> = {}): ProbeEnvironment {
  return {
    gpu: undefined,
    hasSharedArrayBuffer: false,
    isCrossOriginIsolated: false,
    hardwareConcurrency: undefined,
    ...overrides,
  };
}

describe("detectCapabilities", () => {
  it("reports WebGPU available when an adapter is granted", async () => {
    const env = makeEnv({
      gpu: { requestAdapter: async () => ({}) as GPUAdapter },
    });

    const report = await detectCapabilities(env);

    expect(report.isWebGpuAvailable).toBe(true);
  });

  it("reports WebGPU unavailable when the adapter request resolves null", async () => {
    const env = makeEnv({ gpu: { requestAdapter: async () => null } });

    const report = await detectCapabilities(env);

    expect(report.isWebGpuAvailable).toBe(false);
  });

  it("treats a throwing adapter request as unavailable rather than propagating", async () => {
    const env = makeEnv({
      gpu: {
        requestAdapter: async () => {
          throw new Error("adapter blocklisted");
        },
      },
    });

    const report = await detectCapabilities(env);

    expect(report.isWebGpuAvailable).toBe(false);
  });

  it("reports WebGPU unavailable when navigator.gpu is absent", async () => {
    const report = await detectCapabilities(makeEnv());

    expect(report.isWebGpuAvailable).toBe(false);
  });

  it("requires both SharedArrayBuffer and cross-origin isolation for WASM threads", async () => {
    const both = await detectCapabilities(
      makeEnv({ hasSharedArrayBuffer: true, isCrossOriginIsolated: true }),
    );
    const noIsolation = await detectCapabilities(
      makeEnv({ hasSharedArrayBuffer: true, isCrossOriginIsolated: false }),
    );
    const noSab = await detectCapabilities(
      makeEnv({ hasSharedArrayBuffer: false, isCrossOriginIsolated: true }),
    );

    expect(both.hasWasmThreads).toBe(true);
    expect(noIsolation.hasWasmThreads).toBe(false);
    expect(noSab.hasWasmThreads).toBe(false);
  });

  it("propagates hardware concurrency and isolation state into the report", async () => {
    const report = await detectCapabilities(
      makeEnv({ hardwareConcurrency: 8, isCrossOriginIsolated: true }),
    );

    expect(report.hardwareConcurrency).toBe(8);
    expect(report.isCrossOriginIsolated).toBe(true);
  });

  it("returns an immutable report", async () => {
    const report = await detectCapabilities(makeEnv());

    expect(Object.isFrozen(report)).toBe(true);
  });

  it("detects WASM SIMD support as a boolean on the host runtime", async () => {
    const report = await detectCapabilities(makeEnv());

    expect(typeof report.hasWasmSimd).toBe("boolean");
  });
});
