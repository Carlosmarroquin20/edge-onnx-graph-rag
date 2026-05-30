/**
 * Typed error hierarchy for the graph layer. Mirrors the engine's error
 * discipline: every fault carries a `code` discriminant for exhaustive handling
 * and never surfaces as a bare string.
 */

export type GraphErrorCode =
  | "INVALID_ID"
  | "DUPLICATE_NODE"
  | "DUPLICATE_EDGE"
  | "MISSING_NODE"
  | "MISSING_ENDPOINT";

export class GraphError extends Error {
  readonly code: GraphErrorCode;

  constructor(code: GraphErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GraphError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
