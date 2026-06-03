import { describe, expect, it } from "vitest";

import { validateModelId } from "./modelId.js";

describe("validateModelId", () => {
  it("accepts a namespace/name repo id", () => {
    const result = validateModelId("onnx-community/Qwen2.5-0.5B-Instruct");
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe("onnx-community/Qwen2.5-0.5B-Instruct");
  });

  it("accepts a bare name and dotted names", () => {
    expect(validateModelId("gpt2").ok).toBe(true);
    expect(validateModelId("Xenova/all-MiniLM-L6-v2").ok).toBe(true);
  });

  it("trims surrounding whitespace into the normalized id", () => {
    const result = validateModelId("  Xenova/distilgpt2  ");
    expect(result.normalized).toBe("Xenova/distilgpt2");
  });

  it("rejects empty or whitespace-only input", () => {
    expect(validateModelId("").ok).toBe(false);
    expect(validateModelId("   ").ok).toBe(false);
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(validateModelId("https://evil.example/model").ok).toBe(false);
    expect(validateModelId("//evil.example/model").ok).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(validateModelId("../../etc/passwd").ok).toBe(false);
    expect(validateModelId("org/..").ok).toBe(false);
  });

  it("rejects more than one path segment separator", () => {
    expect(validateModelId("a/b/c").ok).toBe(false);
  });

  it("rejects leading/trailing slashes and backslashes", () => {
    expect(validateModelId("/model").ok).toBe(false);
    expect(validateModelId("model/").ok).toBe(false);
    expect(validateModelId("a\\b").ok).toBe(false);
  });

  it("rejects whitespace and out-of-charset characters", () => {
    expect(validateModelId("foo bar").ok).toBe(false);
    expect(validateModelId("foo$bar").ok).toBe(false);
  });

  it("rejects ids beyond the length cap", () => {
    expect(validateModelId("a".repeat(121)).ok).toBe(false);
  });
});
