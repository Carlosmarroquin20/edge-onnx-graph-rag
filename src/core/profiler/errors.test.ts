import { describe, expect, it } from "vitest";

import { ProfilerError } from "./errors.js";

describe("ProfilerError", () => {
  it("is an Error carrying a code discriminant", () => {
    const error = new ProfilerError("EMPTY_AGGREGATE", "no runs");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ProfilerError);
    expect(error.name).toBe("ProfilerError");
    expect(error.code).toBe("EMPTY_AGGREGATE");
    expect(error.message).toBe("no runs");
  });

  it("preserves the prototype chain across narrowing", () => {
    const caught: unknown = new ProfilerError("EMPTY_AGGREGATE", "x");
    expect(caught instanceof ProfilerError).toBe(true);
  });
});
