/**
 * WASM execution backend.
 *
 * Binds the ONNX Runtime Web WASM execution provider via Transformers.js. The
 * thread pool is sized from the host capability report: multi-threading requires
 * `SharedArrayBuffer` and cross-origin isolation, so non-isolated contexts fall
 * back to a single thread. Defaults to 8-bit weights for broad CPU viability.
 */

import { env } from "@huggingface/transformers";
import type { DataType, DeviceType } from "@huggingface/transformers";

import type { BackendKind } from "../../types/inference.js";
import { TransformersBackend } from "./TransformersBackend.js";

/** Conservative thread count when the host does not expose `hardwareConcurrency`. */
const DEFAULT_THREAD_COUNT = 4;

export class WasmBackend extends TransformersBackend {
  readonly backend: BackendKind = "wasm";
  protected readonly device: DeviceType = "wasm";
  protected readonly defaultDtype: DataType = "q8";

  protected override configureRuntime(): void {
    const { wasm } = env.backends.onnx;
    if (wasm === undefined) {
      return;
    }
    if (!this.report.hasWasmThreads) {
      wasm.numThreads = 1;
      return;
    }
    wasm.numThreads =
      this.config.threads ??
      this.report.hardwareConcurrency ??
      DEFAULT_THREAD_COUNT;
  }
}
