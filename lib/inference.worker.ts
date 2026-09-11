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

import { pipeline } from "@huggingface/transformers";
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

import { createInferenceEngine } from "@core/engine/createEngine";
import type { EngineConfig, InferenceEngine } from "@core/types";
import type { WorkerRequest, WorkerResponse } from "./workerProtocol.js";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** Sentence-embedding model for semantic re-ranking; small and WASM-friendly. */
const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

let engine: InferenceEngine | null = null;
let embedder: FeatureExtractionPipeline | null = null;
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
      ...(message.dtype !== undefined ? { dtype: message.dtype } : {}),
      ...(message.revision !== undefined ? { revision: message.revision } : {}),
    };
    engine = await createInferenceEngine(
      config,
      message.preference !== undefined ? { preference: message.preference } : undefined,
    );
    await engine.init((progress) => reply({ type: "progress", progress }));
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

/**
 * Lazily loads the feature-extraction pipeline on first use. Runs on the WASM EP
 * (small model; keeps the WebGPU device free for generation) and reuses the
 * cached pipeline across calls.
 */
async function ensureEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedder === null) {
    // The generic `pipeline` signature expands into a union TS cannot represent
    // (TS2590); bind it to the concrete feature-extraction signature.
    const loadPipeline = pipeline as unknown as (
      task: "feature-extraction",
      model: string,
      options: { device: "wasm"; dtype: "q8" },
    ) => Promise<FeatureExtractionPipeline>;
    embedder = await loadPipeline("feature-extraction", EMBED_MODEL, {
      device: "wasm",
      dtype: "q8",
    });
  }
  return embedder;
}

async function handleEmbed(
  message: Extract<WorkerRequest, { type: "embed" }>,
): Promise<void> {
  const { requestId } = message;
  try {
    const pipe = await ensureEmbedder();
    // Mean-pool and L2-normalize to sentence vectors; `tolist` gives one row
    // per input text.
    const output = await pipe(message.texts as string[], {
      pooling: "mean",
      normalize: true,
    });
    const vectors = output.tolist() as number[][];
    reply({ type: "embedded", requestId, vectors });
  } catch (error) {
    reply({ type: "embed-error", requestId, message: describe(error) });
  }
}

async function handleDispose(): Promise<void> {
  const current = engine;
  engine = null;
  const currentEmbedder = embedder;
  embedder = null;
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
  if (currentEmbedder !== null) {
    try {
      await currentEmbedder.dispose();
    } catch {
      // As above: teardown in progress, nothing to recover.
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
    case "embed":
      void handleEmbed(message);
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
