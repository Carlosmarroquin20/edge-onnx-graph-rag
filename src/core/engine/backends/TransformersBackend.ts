/**
 * Transformers.js-backed inference engine.
 *
 * Shared implementation for every execution provider. Concrete backends supply
 * the target `device`, default precision, and any runtime configuration applied
 * before model load; everything else — pipeline lifecycle, streaming, token
 * accounting, cancellation — is common.
 *
 * Generation is exposed as an `AsyncIterable<GenerationToken>` driven by a
 * Transformers.js `TextStreamer`. A one-step lookahead defers the `isLast` flag
 * to the final emitted delta so consumers receive an accurate terminal marker.
 */

import {
  InterruptableStoppingCriteria,
  StoppingCriteriaList,
  TextStreamer,
  pipeline,
} from "@huggingface/transformers";
import type {
  DataType,
  DeviceType,
  PretrainedModelOptions,
  TextGenerationConfig,
  TextGenerationPipeline,
} from "@huggingface/transformers";

import type {
  BackendKind,
  EngineConfig,
  GenerationOptions,
  GenerationResult,
  GenerationToken,
  InferenceEngine,
  ProgressListener,
} from "../../types/inference.js";
import type { CapabilityReport } from "../../types/inference.js";
import { EngineError } from "../../types/errors.js";
import { createPushPullStream } from "../streaming.js";
import { profileGeneration } from "../../profiler/profileGeneration.js";

const DEFAULT_MAX_NEW_TOKENS = 256;

/**
 * Generation parameters accepted by the pipeline. `stopping_criteria` is a valid
 * runtime parameter not enumerated on the exported `GenerationConfig`; the
 * intersection re-introduces it without resorting to `any`.
 */
type PipelineGenerationConfig = Partial<TextGenerationConfig> & {
  stopping_criteria?: StoppingCriteriaList;
};

/** Mutable carrier for the most recent decoded delta, pending its `isLast` flag. */
interface PendingDelta {
  readonly text: string;
  readonly tokenId?: number;
}

function buildToken(
  delta: PendingDelta,
  index: number,
  isLast: boolean,
): GenerationToken {
  // Construct conditionally: `exactOptionalPropertyTypes` forbids an explicit
  // `tokenId: undefined`.
  return delta.tokenId === undefined
    ? { text: delta.text, index, isLast }
    : { text: delta.text, tokenId: delta.tokenId, index, isLast };
}

export abstract class TransformersBackend implements InferenceEngine {
  abstract readonly backend: BackendKind;
  protected abstract readonly device: DeviceType;
  protected abstract readonly defaultDtype: DataType;

  protected readonly config: EngineConfig;
  protected readonly report: CapabilityReport;

  private pipe: TextGenerationPipeline | null = null;
  private isDisposed = false;

  constructor(config: EngineConfig, report: CapabilityReport) {
    this.config = config;
    this.report = report;
  }

  /** Backend-specific runtime configuration applied once before model load. */
  protected configureRuntime(): void {
    // Default: no additional configuration.
  }

  async init(onProgress?: ProgressListener): Promise<void> {
    if (this.pipe !== null) {
      return;
    }
    if (this.isDisposed) {
      throw new EngineError("ENGINE_DISPOSED", "Cannot initialize a disposed engine.");
    }

    this.configureRuntime();

    const options: PretrainedModelOptions = {
      device: this.device,
      dtype: this.config.dtype ?? this.defaultDtype,
    };
    if (this.config.revision !== undefined) {
      options.revision = this.config.revision;
    }
    if (onProgress !== undefined) {
      // `info` is contextually typed as Transformers.js `ProgressInfo`; map it to
      // the backend-agnostic, clone-safe `ModelLoadProgress`.
      options.progress_callback = (info) => {
        if (info.status === "progress") {
          onProgress({
            status: "progress",
            file: info.file,
            loaded: info.loaded,
            total: info.total,
            progress: info.progress,
          });
        } else if (info.status === "ready") {
          onProgress({ status: "ready" });
        } else {
          onProgress({ status: info.status, file: info.file });
        }
      };
    }

    // The generic `pipeline` signature expands `AllTasks[T]` into a union TS
    // cannot represent (TS2590). Bind it to the concrete task signature so the
    // return type resolves directly to the text-generation pipeline.
    const loadPipeline = pipeline as unknown as (
      task: "text-generation",
      model: string,
      options: PretrainedModelOptions,
    ) => Promise<TextGenerationPipeline>;

    try {
      this.pipe = await loadPipeline("text-generation", this.config.modelId, options);
    } catch (error) {
      throw new EngineError(
        "MODEL_LOAD_FAILED",
        `Failed to load model "${this.config.modelId}" on backend "${this.backend}".`,
        { cause: error },
      );
    }

    await this.warmUp();
  }

  generate(
    prompt: string,
    options: GenerationOptions = {},
  ): AsyncIterable<GenerationToken> {
    const pipe = this.requirePipe();
    const stream = createPushPullStream<GenerationToken>();

    const interrupt = new InterruptableStoppingCriteria();
    const criteria = new StoppingCriteriaList();
    criteria.push(interrupt);

    let index = 0;
    let pending: PendingDelta | null = null;
    let lastTokenId: number | undefined;

    const flushPending = (isLast: boolean): void => {
      if (pending === null) {
        return;
      }
      stream.push(buildToken(pending, index, isLast));
      index += 1;
      pending = null;
    };

    const streamer = new TextStreamer(pipe.tokenizer, {
      skip_prompt: true,
      token_callback_function: (ids: bigint[]): void => {
        const last = ids.at(-1);
        if (last !== undefined) {
          lastTokenId = Number(last);
        }
      },
      callback_function: (text: string): void => {
        if (text.length === 0) {
          return;
        }
        flushPending(false);
        pending = lastTokenId === undefined ? { text } : { text, tokenId: lastTokenId };
      },
    });

    const { signal } = options;
    const onAbort = (): void => interrupt.interrupt();
    if (signal !== undefined) {
      if (signal.aborted) {
        interrupt.interrupt();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    void (async (): Promise<void> => {
      try {
        await pipe(prompt, this.buildGenerationConfig(options, streamer, criteria));
        flushPending(true);
        stream.close();
      } catch (error) {
        stream.fail(
          new EngineError("GENERATION_FAILED", "Token generation failed.", {
            cause: error,
          }),
        );
      } finally {
        if (signal !== undefined) {
          signal.removeEventListener("abort", onAbort);
        }
      }
    })();

    return stream.iterable;
  }

  async complete(
    prompt: string,
    options: GenerationOptions = {},
  ): Promise<GenerationResult> {
    const pipe = this.requirePipe();
    // Prompt token count is exact (encoded here); generation timing and the
    // emitted-step count come from the profiler instrumenting our own stream.
    const run = profileGeneration(this.generate(prompt, options), {
      backend: this.backend,
      modelId: this.config.modelId,
      promptTokenCount: pipe.tokenizer.encode(prompt).length,
    });

    let text = "";
    for await (const token of run.tokens) {
      text += token.text;
    }

    return { text, metrics: await run.metrics };
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    if (this.pipe !== null) {
      await this.pipe.dispose();
      this.pipe = null;
    }
  }

  /** Single short generation to amortize shader/graph compilation on first use. */
  private async warmUp(): Promise<void> {
    const pipe = this.requirePipe();
    try {
      await pipe("warmup", { max_new_tokens: 1, do_sample: false });
    } catch (error) {
      throw new EngineError("MODEL_LOAD_FAILED", "Warm-up pass failed.", {
        cause: error,
      });
    }
  }

  private buildGenerationConfig(
    options: GenerationOptions,
    streamer: TextStreamer,
    criteria: StoppingCriteriaList,
  ): PipelineGenerationConfig {
    const isSampling =
      options.temperature !== undefined ||
      options.topK !== undefined ||
      options.topP !== undefined;

    const config: PipelineGenerationConfig = {
      streamer,
      stopping_criteria: criteria,
      return_full_text: false,
      max_new_tokens: options.maxNewTokens ?? DEFAULT_MAX_NEW_TOKENS,
      do_sample: isSampling,
    };
    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
    }
    if (options.topK !== undefined) {
      config.top_k = options.topK;
    }
    if (options.topP !== undefined) {
      config.top_p = options.topP;
    }
    return config;
  }

  private requirePipe(): TextGenerationPipeline {
    if (this.isDisposed) {
      throw new EngineError("ENGINE_DISPOSED", "Engine has been disposed.");
    }
    if (this.pipe === null) {
      throw new EngineError(
        "MODEL_LOAD_FAILED",
        "Engine is not initialized; call init() before generation.",
      );
    }
    return this.pipe;
  }
}
