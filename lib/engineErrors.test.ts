import { describe, expect, it } from "vitest";

import { describeEngineFailure } from "./engineErrors.js";

const NO_BACKEND = "No execution backend satisfied the host capability report.";

describe("describeEngineFailure", () => {
  it("rewrites the no-backend error into an actionable message when WebGPU was forced", () => {
    const message = describeEngineFailure(NO_BACKEND, "webgpu");
    expect(message).toContain("WebGPU");
    expect(message).toContain("Auto or WASM");
    expect(message).not.toBe(NO_BACKEND);
  });

  it("leaves the no-backend error untouched under Auto (it would not normally occur)", () => {
    expect(describeEngineFailure(NO_BACKEND, "auto")).toBe(NO_BACKEND);
  });

  it("leaves the no-backend error untouched under WASM", () => {
    expect(describeEngineFailure(NO_BACKEND, "wasm")).toBe(NO_BACKEND);
  });

  it("passes through an unrelated failure even when WebGPU was forced", () => {
    const message = 'Failed to load model "acme/model" on backend "webgpu".';
    expect(describeEngineFailure(message, "webgpu")).toBe(message);
  });
});
