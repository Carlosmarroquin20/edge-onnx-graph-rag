/**
 * User-facing engine-failure messages.
 *
 * The factory throws a generic "no backend satisfied the report" error when a
 * pinned backend cannot be provided. Forcing WebGPU on a host without a
 * compatible adapter is the common cause, so translate that case into an
 * actionable message; everything else passes through unchanged.
 */

import type { BackendChoice } from "./graphRagClient.js";

/** The `NoBackendAvailableError` message fragment emitted by the factory. */
const NO_BACKEND = "No execution backend";

export function describeEngineFailure(
  message: string,
  backend: BackendChoice,
): string {
  if (backend === "webgpu" && message.includes(NO_BACKEND)) {
    return "WebGPU was requested but no compatible adapter is available on this device. Switch the backend to Auto or WASM.";
  }
  return message;
}
