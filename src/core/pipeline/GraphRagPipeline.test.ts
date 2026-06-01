import { describe, expect, it } from "vitest";

import { GraphRagPipeline, type SeedResolver } from "./GraphRagPipeline.js";
import { GraphBuilder } from "../graph/GraphBuilder.js";
import { GraphStore } from "../graph/GraphStore.js";
import { asNodeId } from "../graph/ids.js";
import type {
  GenerationOptions,
  GenerationToken,
  GenerationResult,
  InferenceEngine,
} from "../types/inference.js";

/** Records the prompts it receives and returns a canned, streamed answer. */
class StubEngine implements InferenceEngine {
  readonly backend = "wasm" as const;
  readonly prompts: string[] = [];

  constructor(private readonly answer: string) {}

  async init(): Promise<void> {}

  async *generate(
    prompt: string,
    _options?: GenerationOptions,
  ): AsyncIterable<GenerationToken> {
    this.prompts.push(prompt);
    const words = this.answer.split(" ");
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index] ?? "";
      yield {
        text: index === 0 ? word : ` ${word}`,
        index,
        isLast: index === words.length - 1,
      };
    }
  }

  async complete(
    prompt: string,
    _options?: GenerationOptions,
  ): Promise<GenerationResult> {
    this.prompts.push(prompt);
    return {
      text: this.answer,
      metrics: {
        backend: this.backend,
        modelId: "stub",
        timeToFirstTokenMs: 1,
        wallClockMs: 2,
        tokensPerSecond: 10,
        promptTokenCount: 3,
        generatedTokenCount: 4,
        peakMemoryBytes: undefined,
        startedAt: 0,
      },
    };
  }

  async dispose(): Promise<void> {}
}

/** A small graph: Alice—knows→Bob—founded→Acme. */
function buildGraph(): GraphStore {
  const builder = new GraphBuilder();
  builder.ingest({
    nodes: [],
    edges: [
      { source: "Alice", target: "Bob", relation: "knows", directed: true },
      { source: "Bob", target: "Acme", relation: "founded", directed: true },
    ],
  });
  return builder.graph;
}

describe("GraphRagPipeline.prepare", () => {
  it("resolves seeds from the query and assembles context into the prompt", () => {
    const pipeline = new GraphRagPipeline(new StubEngine("ok"), buildGraph());

    const prepared = pipeline.prepare("What does Alice know?", { maxHops: 2 });

    expect(prepared.seeds).toHaveLength(1);
    expect(prepared.context.text).toContain("Alice");
    expect(prepared.context.text).toContain("Bob");
    expect(prepared.prompt).toContain("Context:");
    expect(prepared.prompt).toContain("Question: What does Alice know?");
  });

  it("degrades to the bare query when no entity matches the graph", () => {
    const pipeline = new GraphRagPipeline(new StubEngine("ok"), buildGraph());

    const prepared = pipeline.prepare("Tell me something interesting");

    expect(prepared.seeds).toHaveLength(0);
    expect(prepared.context.text).toBe("");
    expect(prepared.prompt).toBe("Tell me something interesting");
  });

  it("bounds the context to the token budget", () => {
    const pipeline = new GraphRagPipeline(new StubEngine("ok"), buildGraph());

    const prepared = pipeline.prepare("What does Alice know?", {
      maxHops: 2,
      tokenBudget: 4,
    });

    expect(prepared.context.truncated).toBe(true);
    expect(prepared.context.tokenCount).toBeLessThanOrEqual(4);
  });

  it("honors an injected seed resolver", () => {
    const resolveSeeds: SeedResolver = () => [asNodeId("g:n:1")];
    const pipeline = new GraphRagPipeline(new StubEngine("ok"), buildGraph(), {
      resolveSeeds,
    });

    const prepared = pipeline.prepare("anything");

    expect(prepared.seeds.map(String)).toEqual(["g:n:1"]);
  });
});

describe("GraphRagPipeline.run", () => {
  it("sends the augmented prompt to the engine and returns answer + metrics", async () => {
    const engine = new StubEngine("Alice knows Bob.");
    const pipeline = new GraphRagPipeline(engine, buildGraph());

    const result = await pipeline.run("What does Alice know?");

    expect(result.answer).toBe("Alice knows Bob.");
    expect(result.metrics.backend).toBe("wasm");
    expect(engine.prompts).toHaveLength(1);
    expect(engine.prompts[0]).toContain("Context:");
    expect(engine.prompts[0]).toBe(result.prompt);
  });
});

describe("GraphRagPipeline.stream", () => {
  it("streams the answer for the augmented prompt", async () => {
    const engine = new StubEngine("Alice knows Bob");
    const pipeline = new GraphRagPipeline(engine, buildGraph());

    const stream = pipeline.stream("What does Alice know?");
    let assembled = "";
    for await (const token of stream.tokens) {
      assembled += token.text;
    }

    expect(assembled).toBe("Alice knows Bob");
    expect(stream.prompt).toContain("Question: What does Alice know?");
  });
});
