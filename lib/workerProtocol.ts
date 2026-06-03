/**
 * Message protocol between the main thread and the inference worker.
 *
 * Only structured-cloneable data crosses the boundary: prompts, plain option
 * bags, and `GenerationToken` records (plain objects). The `AbortSignal` is not
 * transferable — cancellation is expressed as an explicit `cancel` message keyed
 * by `requestId`.
 */

import type { BackendKind, GenerationToken } from "@core/types";

export type EngineDtype = "fp32" | "fp16" | "q8" | "q4";

/** Generation parameters minus the non-serializable `AbortSignal`. */
export interface SerializableGenerationOptions {
  readonly maxNewTokens?: number;
  readonly temperature?: number;
  readonly topK?: number;
  readonly topP?: number;
}

/** Main thread → worker. */
export type WorkerRequest =
  | {
      readonly type: "init";
      readonly modelId: string;
      readonly dtype: EngineDtype;
      readonly revision?: string;
    }
  | {
      readonly type: "generate";
      readonly requestId: number;
      readonly prompt: string;
      readonly options: SerializableGenerationOptions;
    }
  | { readonly type: "cancel"; readonly requestId: number }
  | { readonly type: "dispose" };

/** Worker → main thread. */
export type WorkerResponse =
  | { readonly type: "ready"; readonly backend: BackendKind }
  | { readonly type: "init-error"; readonly message: string }
  | {
      readonly type: "token";
      readonly requestId: number;
      readonly token: GenerationToken;
    }
  | { readonly type: "done"; readonly requestId: number }
  | { readonly type: "error"; readonly requestId: number; readonly message: string };
