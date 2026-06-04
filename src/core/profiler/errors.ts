/**
 * Typed error hierarchy for the profiler layer. Mirrors the engine and graph
 * layers: every fault carries a `code` discriminant and never surfaces as a
 * bare string.
 */

export type ProfilerErrorCode = "EMPTY_AGGREGATE";

export class ProfilerError extends Error {
  readonly code: ProfilerErrorCode;

  constructor(code: ProfilerErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProfilerError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
