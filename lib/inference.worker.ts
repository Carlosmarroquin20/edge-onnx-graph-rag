/**
 * Inference worker.
 *
 * Owns the `InferenceEngine` (and its Transformers.js / onnxruntime-web runtime)
 * off the main thread, so model loading and token decoding never block the UI.
 * Capability negotiation (WebGPU → WASM) runs in this worker context, where
 * `navigator.gpu`, `SharedArrayBuffer`, and cross-origin isolation are available.
 *
 * The heavy runtime is bundled into this worker chunk alone; the main bundle
 * stays free of it.
 */

import { createInferenceEngine } from "@core/engine/createEngine";
import type { EngineConfig, InferenceEngine } from "@core/types";
import type { WorkerRequest, WorkerResponse } from "./workerProtocol.js";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let engine: InferenceEngine | null = null;
const controllers = new Map<number, AbortController>();

function reply(message: WorkerResponse): void {
  ctx.postMessage(message);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleInit(
  message: Extract<WorkerRequest, { type: "init" }>,
): Promise<void> {
  try {
    const config: EngineConfig = {
      modelId: message.modelId,
      dtype: message.dtype,
      ...(message.revision !== undefined ? { revision: message.revision } : {}),
    };
    engine = await createInferenceEngine(config);
    await engine.init();
    reply({ type: "ready", backend: engine.backend });
  } catch (error) {
    reply({ type: "init-error", message: describe(error) });
  }
}

async function handleGenerate(
  message: Extract<WorkerRequest, { type: "generate" }>,
): Promise<void> {
  const { requestId } = message;
  if (engine === null) {
    reply({ type: "error", requestId, message: "Engine is not initialized." });
    return;
  }

  const controller = new AbortController();
  controllers.set(requestId, controller);
  try {
    const tokens = engine.generate(message.prompt, {
      ...message.options,
      signal: controller.signal,
    });
    for await (const token of tokens) {
      reply({ type: "token", requestId, token });
    }
    reply({ type: "done", requestId });
  } catch (error) {
    reply({ type: "error", requestId, message: describe(error) });
  } finally {
    controllers.delete(requestId);
  }
}

async function handleDispose(): Promise<void> {
  const current = engine;
  engine = null;
  for (const controller of controllers.values()) {
    controller.abort();
  }
  controllers.clear();
  if (current !== null) {
    try {
      await current.dispose();
    } catch {
      // Nothing actionable on a disposal fault; the worker is being torn down.
    }
  }
}

ctx.addEventListener("message", (event: MessageEvent<WorkerRequest>): void => {
  const message = event.data;
  switch (message.type) {
    case "init":
      void handleInit(message);
      break;
    case "generate":
      void handleGenerate(message);
      break;
    case "cancel":
      controllers.get(message.requestId)?.abort();
      break;
    case "dispose":
      void handleDispose();
      break;
    default:
      break;
  }
});
