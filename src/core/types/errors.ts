/**
 * Typed error hierarchy. All thrown faults extend {@link EngineError} and carry
 * a `code` discriminant for exhaustive handling at call sites.
 */

export type EngineErrorCode =
  | "NO_BACKEND_AVAILABLE"
  | "MODEL_LOAD_FAILED"
  | "GENERATION_FAILED"
  | "ENGINE_DISPOSED"
  | "INVALID_CONFIG";

/** Base for all recoverable-by-caller faults raised by the engine layer. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EngineError";
    this.code = code;
    // Restore prototype chain when targeting transpiled ES classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** No backend satisfied the host capability report. */
export class NoBackendAvailableError extends EngineError {
  constructor(message: string, options?: ErrorOptions) {
    super("NO_BACKEND_AVAILABLE", message, options);
    this.name = "NoBackendAvailableError";
  }
}
