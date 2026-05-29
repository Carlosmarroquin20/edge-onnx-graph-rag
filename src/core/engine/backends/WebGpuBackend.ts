/**
 * WebGPU execution backend.
 *
 * Binds the ONNX Runtime Web WebGPU execution provider via Transformers.js.
 * Defaults to 4-bit weights, which the WebGPU EP dequantizes on device for a
 * favorable memory/throughput trade-off on consumer GPUs.
 */

import type { DataType, DeviceType } from "@huggingface/transformers";

import type { BackendKind } from "../../types/inference.js";
import { TransformersBackend } from "./TransformersBackend.js";

export class WebGpuBackend extends TransformersBackend {
  readonly backend: BackendKind = "webgpu";
  protected readonly device: DeviceType = "webgpu";
  protected readonly defaultDtype: DataType = "q4";
}
