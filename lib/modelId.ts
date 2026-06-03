/**
 * Model identifier validation.
 *
 * The model id is user-supplied and used to construct a remote fetch against a
 * model hub. Constrain it to a Hugging Face-style repo id (`namespace/name` or
 * `name`) before it ever reaches the loader: reject absolute/protocol-relative
 * URLs (which would redirect the fetch off-hub), path traversal, backslashes,
 * whitespace, and out-of-charset input. This is input validation / defense in
 * depth, not a guarantee about the contents of a given repo.
 */

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_LENGTH = 120;

export interface ModelIdValidation {
  readonly ok: boolean;
  /** Trimmed, canonical id when `ok`. */
  readonly normalized?: string;
  /** Human-readable rejection reason when not `ok`. */
  readonly reason?: string;
}

function reject(reason: string): ModelIdValidation {
  return { ok: false, reason };
}

export function validateModelId(input: string): ModelIdValidation {
  const value = input.trim();

  if (value.length === 0) {
    return reject("Model id is required.");
  }
  if (value.length > MAX_LENGTH) {
    return reject(`Model id must be at most ${MAX_LENGTH} characters.`);
  }
  if (/\s/.test(value)) {
    return reject("Model id must not contain whitespace.");
  }
  if (value.includes("://") || value.startsWith("//")) {
    return reject("Model id must be a repo id (namespace/name), not a URL.");
  }
  if (value.includes("..")) {
    return reject("Model id must not contain '..'.");
  }
  if (value.includes("\\")) {
    return reject("Model id must not contain backslashes.");
  }

  const segments = value.split("/");
  if (segments.length > 2) {
    return reject("Model id may contain at most one '/'.");
  }
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) {
      return reject(
        "Model id may only use letters, digits, '.', '_', '-', as 'namespace/name'.",
      );
    }
  }

  return { ok: true, normalized: value };
}
