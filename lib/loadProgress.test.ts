import { describe, expect, it } from "vitest";

import { DownloadAggregator } from "./loadProgress.js";

describe("DownloadAggregator", () => {
  it("reports a single file's percentage", () => {
    const aggregator = new DownloadAggregator();
    const state = aggregator.update({
      status: "progress",
      file: "model.onnx",
      loaded: 50,
      total: 100,
    });

    expect(state.percent).toBe(50);
    expect(state.file).toBe("model.onnx");
    expect(state.done).toBe(false);
  });

  it("aggregates bytes across multiple files", () => {
    const aggregator = new DownloadAggregator();
    aggregator.update({ status: "progress", file: "a", loaded: 50, total: 100 });
    const state = aggregator.update({
      status: "progress",
      file: "b",
      loaded: 100,
      total: 100,
    });

    // (50 + 100) / (100 + 100) = 75%.
    expect(state.percent).toBe(75);
  });

  it("caps below 100 until the ready event", () => {
    const aggregator = new DownloadAggregator();
    const downloading = aggregator.update({
      status: "progress",
      file: "a",
      loaded: 100,
      total: 100,
    });
    expect(downloading.percent).toBe(99);

    const ready = aggregator.update({ status: "ready" });
    expect(ready.percent).toBe(100);
    expect(ready.done).toBe(true);
  });

  it("yields a null percentage when no byte totals are known yet", () => {
    const aggregator = new DownloadAggregator();
    const state = aggregator.update({ status: "download", file: "config.json" });

    expect(state.percent).toBeNull();
    expect(state.file).toBe("config.json");
  });

  it("updates a file's loaded bytes across successive events", () => {
    const aggregator = new DownloadAggregator();
    aggregator.update({ status: "progress", file: "a", loaded: 20, total: 100 });
    const state = aggregator.update({
      status: "progress",
      file: "a",
      loaded: 80,
      total: 100,
    });

    expect(state.percent).toBe(80);
  });
});
