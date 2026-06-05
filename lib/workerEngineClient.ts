/**
 * Main-thread proxy for the inference worker.
 *
 * Implements {@link InferenceEngine} so callers — notably `GraphRagPipeline` —
 * are agnostic to the fact that generation runs in a worker. Token streams are
 * reconstructed on this side via the push-to-pull bridge, and cancellation is
 * relayed to the worker as an explicit message.
 */

import { createPushPullStream, type PushPullStream } from "@core/engine";
import { estimateTokensByChars } from "@core/graph";
import { profileGeneration } from "@core/profiler";
import type {
  BackendKind,
  EngineConfig,
  GenerationOptions,
  GenerationResult,
  GenerationToken,
  InferenceEngine,
  ProgressListener,
} from "@core/types";
import type {
  EngineDtype,
  SerializableGenerationOptions,
  WorkerRequest,
  WorkerResponse,
} from "./workerProtocol.js";

function toSerializable(options: GenerationOptions): SerializableGenerationOptions {
  const serializable: {
    maxNewTokens?: number;
    temperature?: number;
    topK?: number;
    topP?: number;
  } = {};
  if (options.maxNewTokens !== undefined) {
    serializable.maxNewTokens = options.maxNewTokens;
  }
  if (options.temperature !== undefined) {
    serializable.temperature = options.temperature;
  }
  if (options.topK !== undefined) {
    serializable.topK = options.topK;
  }
  if (options.topP !== undefined) {
    serializable.topP = options.topP;
  }
  return serializable;
}

export class WorkerEngineClient implements InferenceEngine {
  private readonly worker: Worker;
  private readonly streams = new Map<number, PushPullStream<GenerationToken>>();
  private initPromise: Promise<void> | null = null;
  private initResolve: (() => void) | null = null;
  private initReject: ((reason: unknown) => void) | null = null;
  private nextRequestId = 1;
  private negotiatedBackend: BackendKind = "wasm";
  private onProgress: ProgressListener | undefined;

  constructor(private readonly config: EngineConfig) {
    this.worker = new Worker(new URL("./inference.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.addEventListener("message", this.handleMessage);
  }

  get backend(): BackendKind {
    return this.negotiatedBackend;
  }

  init(onProgress?: ProgressListener): Promise<void> {
    if (this.initPromise === null) {
      this.onProgress = onProgress;
      this.initPromise = new Promise<void>((resolve, reject) => {
        this.initResolve = resolve;
        this.initReject = reject;
      });
      this.post({
        type: "init",
        modelId: this.config.modelId,
        dtype: (this.config.dtype ?? "q4") as EngineDtype,
        ...(this.config.revision !== undefined ? { revision: this.config.revision } : {}),
      });
    }
    return this.initPromise;
  }

  generate(
    prompt: string,
    options: GenerationOptions = {},
  ): AsyncIterable<GenerationToken> {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const stream = createPushPullStream<GenerationToken>();
    this.streams.set(requestId, stream);

    const { signal } = options;
    const onAbort = (): void => this.post({ type: "cancel", requestId });

    if (signal?.aborted === true) {
      stream.close();
    } else {
      if (signal !== undefined) {
        signal.addEventListener("abort", onAbort, { once: true });
      }
      this.post({
        type: "generate",
        requestId,
        prompt,
        options: toSerializable(options),
      });
    }

    return this.drain(requestId, stream, signal, onAbort);
  }

  async complete(
    prompt: string,
    options: GenerationOptions = {},
  ): Promise<GenerationResult> {
    const run = profileGeneration(this.generate(prompt, options), {
      backend: this.backend,
      modelId: this.config.modelId,
      promptTokenCount: estimateTokensByChars(prompt),
    });
    let text = "";
    for await (const token of run.tokens) {
      text += token.text;
    }
    return { text, metrics: await run.metrics };
  }

  async dispose(): Promise<void> {
    this.post({ type: "dispose" });
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.terminate();
    for (const stream of this.streams.values()) {
      stream.close();
    }
    this.streams.clear();
  }

  /** Yields the request's tokens, cleaning up listeners and routing on exit. */
  private async *drain(
    requestId: number,
    stream: PushPullStream<GenerationToken>,
    signal: AbortSignal | undefined,
    onAbort: () => void,
  ): AsyncIterable<GenerationToken> {
    try {
      yield* stream.iterable;
    } finally {
      this.streams.delete(requestId);
      if (signal !== undefined) {
        signal.removeEventListener("abort", onAbort);
      }
    }
  }

  private readonly handleMessage = (event: MessageEvent<WorkerResponse>): void => {
    const message = event.data;
    switch (message.type) {
      case "progress":
        this.onProgress?.(message.progress);
        break;
      case "ready":
        this.negotiatedBackend = message.backend;
        this.settleInit(null);
        break;
      case "init-error":
        this.settleInit(new Error(message.message));
        break;
      case "token":
        this.streams.get(message.requestId)?.push(message.token);
        break;
      case "done":
        this.streams.get(message.requestId)?.close();
        break;
      case "error":
        this.streams.get(message.requestId)?.fail(new Error(message.message));
        break;
      default:
        break;
    }
  };

  private settleInit(error: Error | null): void {
    if (error === null) {
      this.initResolve?.();
    } else {
      this.initReject?.(error);
    }
    this.initResolve = null;
    this.initReject = null;
  }

  private post(message: WorkerRequest): void {
    this.worker.postMessage(message);
  }
}
