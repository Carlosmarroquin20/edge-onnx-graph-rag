import { describe, expect, it, vi } from "vitest";

import {
  EngineFactory,
  selectBackend,
  type BackendConstructor,
} from "./EngineFactory.js";
import { NoBackendAvailableError } from "../types/errors.js";
import type {
  BackendKind,
  CapabilityReport,
  EngineConfig,
  InferenceEngine,
} from "../types/inference.js";

function makeReport(overrides: Partial<CapabilityReport> = {}): CapabilityReport {
  return {
    isWebGpuAvailable: false,
    hasWasmSimd: true,
    hasWasmThreads: false,
    isCrossOriginIsolated: false,
    hardwareConcurrency: 4,
    ...overrides,
  };
}

function makeStubEngine(backend: BackendKind): InferenceEngine {
  return {
    backend,
    init: async () => undefined,
    generate: async function* () {
      // No tokens; the stub is used only for construction-path assertions.
    },
    complete: async () => ({
      text: "",
      metrics: {
        backend,
        modelId: "stub",
        timeToFirstTokenMs: 0,
        wallClockMs: 0,
        tokensPerSecond: 0,
        promptTokenCount: 0,
        generatedTokenCount: 0,
        peakMemoryBytes: undefined,
        startedAt: 0,
      },
    }),
    dispose: async () => undefined,
  };
}

const CONFIG: EngineConfig = { modelId: "stub-model" };

describe("selectBackend", () => {
  it("prefers WebGPU when available", () => {
    expect(selectBackend(makeReport({ isWebGpuAvailable: true }))).toBe("webgpu");
  });

  it("falls back to WASM when WebGPU is unavailable", () => {
    expect(selectBackend(makeReport({ isWebGpuAvailable: false }))).toBe("wasm");
  });

  it("honors an explicit preference order", () => {
    const report = makeReport({ isWebGpuAvailable: true });
    expect(selectBackend(report, ["wasm", "webgpu"])).toBe("wasm");
  });

  it("returns null when no candidate qualifies", () => {
    expect(selectBackend(makeReport({ isWebGpuAvailable: true }), [])).toBeNull();
  });
});

describe("EngineFactory.create", () => {
  it("constructs the selected backend with the resolved report", async () => {
    const report = makeReport({ isWebGpuAvailable: true });
    const webgpu: BackendConstructor = vi.fn(() => makeStubEngine("webgpu"));
    const wasm: BackendConstructor = vi.fn(() => makeStubEngine("wasm"));
    const factory = new EngineFactory(
      new Map<BackendKind, BackendConstructor>([
        ["webgpu", webgpu],
        ["wasm", wasm],
      ]),
    );

    const engine = await factory.create(CONFIG, { report });

    expect(engine.backend).toBe("webgpu");
    expect(webgpu).toHaveBeenCalledWith(CONFIG, report);
    expect(wasm).not.toHaveBeenCalled();
  });

  it("falls back to the WASM constructor when WebGPU is unavailable", async () => {
    const report = makeReport({ isWebGpuAvailable: false });
    const factory = new EngineFactory(
      new Map<BackendKind, BackendConstructor>([
        ["webgpu", () => makeStubEngine("webgpu")],
        ["wasm", () => makeStubEngine("wasm")],
      ]),
    );

    const engine = await factory.create(CONFIG, { report });

    expect(engine.backend).toBe("wasm");
  });

  it("throws when no backend qualifies under the given preference", async () => {
    const factory = new EngineFactory(
      new Map<BackendKind, BackendConstructor>([
        ["wasm", () => makeStubEngine("wasm")],
      ]),
    );

    await expect(
      factory.create(CONFIG, { report: makeReport(), preference: [] }),
    ).rejects.toBeInstanceOf(NoBackendAvailableError);
  });

  it("throws when the selected backend has no registered constructor", async () => {
    const factory = new EngineFactory(new Map<BackendKind, BackendConstructor>());

    await expect(
      factory.create(CONFIG, { report: makeReport({ isWebGpuAvailable: true }) }),
    ).rejects.toBeInstanceOf(NoBackendAvailableError);
  });
});
