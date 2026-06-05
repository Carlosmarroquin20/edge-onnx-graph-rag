/**
 * Model-download progress aggregation.
 *
 * Transformers.js reports progress per asset file; this folds those events into
 * a single overall percentage (bytes loaded / bytes total across all files seen)
 * for a progress bar. The percentage is capped below 100 until the terminal
 * `ready` event, so the bar does not read "complete" while warm-up still runs.
 */

import type { ModelLoadProgress } from "@core/types";

export interface DownloadState {
  /** 0–100 overall, or `null` when no byte totals are known yet (e.g. cache hit). */
  readonly percent: number | null;
  /** The file most recently reported, for display. */
  readonly file: string | null;
  /** True once the load has fully completed. */
  readonly done: boolean;
}

export const IDLE_DOWNLOAD: DownloadState = {
  percent: null,
  file: null,
  done: false,
};

export class DownloadAggregator {
  private readonly files = new Map<string, { loaded: number; total: number }>();
  private currentFile: string | null = null;
  private completed = false;

  update(progress: ModelLoadProgress): DownloadState {
    if (progress.status === "ready") {
      this.completed = true;
    } else if (progress.file !== undefined) {
      this.currentFile = progress.file;
      if (progress.total !== undefined && progress.total > 0) {
        this.files.set(progress.file, {
          loaded: progress.loaded ?? 0,
          total: progress.total,
        });
      }
    }
    return this.snapshot();
  }

  snapshot(): DownloadState {
    if (this.completed) {
      return { percent: 100, file: null, done: true };
    }
    let loaded = 0;
    let total = 0;
    for (const entry of this.files.values()) {
      loaded += entry.loaded;
      total += entry.total;
    }
    const percent =
      total > 0 ? Math.min(99, Math.floor((loaded / total) * 100)) : null;
    return { percent, file: this.currentFile, done: false };
  }
}
