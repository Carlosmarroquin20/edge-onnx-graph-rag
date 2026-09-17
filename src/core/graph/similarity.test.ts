import { describe, expect, it } from "vitest";

import type { GraphNode, SubgraphResult } from "../types/graph.js";
import { asNodeId } from "./ids.js";
import {
  cosineSimilarity,
  rerankBySimilarity,
  resolveSeedsBySimilarity,
} from "./similarity.js";

function node(id: string, embedding?: ReadonlyArray<number>): GraphNode {
  return {
    id: asNodeId(id),
    type: "entity",
    label: id,
    properties: {},
    ...(embedding !== undefined ? { embedding } : {}),
  };
}

function subgraph(
  nodes: ReadonlyArray<GraphNode>,
  scores: ReadonlyArray<readonly [string, number]>,
): SubgraphResult {
  return {
    nodes,
    edges: [],
    scores: new Map(scores.map(([id, s]) => [asNodeId(id), s])),
  };
}

describe("cosineSimilarity", () => {
  it("is 1 for identical direction, -1 for opposite, 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 for empty, mismatched, or zero-magnitude vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("rerankBySimilarity", () => {
  it("returns the input unchanged when the query embedding is empty", () => {
    const sg = subgraph([node("a", [1, 0])], [["a", 1]]);
    expect(rerankBySimilarity(sg, [])).toBe(sg);
  });

  it("returns the input unchanged when structuralWeight is 1 (pure structural)", () => {
    const sg = subgraph([node("a", [1, 0])], [["a", 1]]);
    expect(rerankBySimilarity(sg, [1, 0], { structuralWeight: 1 })).toBe(sg);
  });

  it("lets semantic similarity lift a structurally-weaker but on-topic node above a stronger off-topic one", () => {
    // a: seed (structural 1.0) but orthogonal to the query; b: one hop out
    // (structural 0.5) but aligned with the query.
    const sg = subgraph(
      [node("a", [0, 1]), node("b", [1, 0])],
      [
        ["a", 1],
        ["b", 0.5],
      ],
    );
    const reranked = rerankBySimilarity(sg, [1, 0], { structuralWeight: 0.3 });
    const a = reranked.scores.get(asNodeId("a")) ?? 0;
    const b = reranked.scores.get(asNodeId("b")) ?? 0;
    expect(b).toBeGreaterThan(a);
  });

  it("gives a node without an embedding its normalized structural score only", () => {
    const sg = subgraph(
      [node("a", [1, 0]), node("c")],
      [
        ["a", 1],
        ["c", 0.5],
      ],
    );
    const reranked = rerankBySimilarity(sg, [1, 0], { structuralWeight: 0.5 });
    // a: struct normalized 1, semantic 1 -> 1.0; c: struct normalized 0, no embedding -> 0.
    expect(reranked.scores.get(asNodeId("a"))).toBeCloseTo(1);
    expect(reranked.scores.get(asNodeId("c"))).toBeCloseTo(0);
  });

  it("treats uniform structural scores as equally maximal, so semantic breaks the tie", () => {
    const sg = subgraph(
      [node("a", [1, 0]), node("b", [0, 1])],
      [
        ["a", 0.5],
        ["b", 0.5],
      ],
    );
    const reranked = rerankBySimilarity(sg, [1, 0], { structuralWeight: 0.5 });
    // Both structural-normalized to 1; a aligned (sem 1) -> 1.0, b orthogonal (sem 0) -> 0.5.
    expect(reranked.scores.get(asNodeId("a"))).toBeCloseTo(1);
    expect(reranked.scores.get(asNodeId("b"))).toBeCloseTo(0.5);
    expect(reranked.nodes).toBe(sg.nodes);
    expect(reranked.edges).toBe(sg.edges);
  });

  it("clamps negative similarity to zero so an anti-correlated node is not pushed below structural-only nodes", () => {
    const sg = subgraph(
      [node("a", [-1, 0]), node("b")],
      [
        ["a", 1],
        ["b", 1],
      ],
    );
    const reranked = rerankBySimilarity(sg, [1, 0], { structuralWeight: 0.5 });
    // Uniform structural -> both normalized to 1. a: 0.5*1 + 0.5*max(0,-1)=0.5; b: structural-only 1.
    expect(reranked.scores.get(asNodeId("a"))).toBeCloseTo(0.5);
    expect(reranked.scores.get(asNodeId("b"))).toBeCloseTo(1);
  });
});

describe("resolveSeedsBySimilarity", () => {
  it("returns no seeds for an empty query embedding", () => {
    expect(resolveSeedsBySimilarity([node("a", [1, 0])], [])).toEqual([]);
  });

  it("ranks embedded nodes by similarity and caps at topK", () => {
    const nodes = [node("a", [1, 0]), node("b", [0.8, 0.2]), node("c", [0, 1])];
    const seeds = resolveSeedsBySimilarity(nodes, [1, 0], { topK: 2, minScore: 0 });
    expect(seeds.map(String)).toEqual(["a", "b"]);
  });

  it("filters out nodes below minScore", () => {
    const nodes = [node("a", [1, 0]), node("c", [0, 1])];
    // c is orthogonal (score 0) -> excluded at the default threshold.
    const seeds = resolveSeedsBySimilarity(nodes, [1, 0]);
    expect(seeds.map(String)).toEqual(["a"]);
  });

  it("skips nodes without an embedding", () => {
    const nodes = [node("a"), node("b", [1, 0])];
    const seeds = resolveSeedsBySimilarity(nodes, [1, 0], { minScore: 0 });
    expect(seeds.map(String)).toEqual(["b"]);
  });

  it("returns nothing when no node clears the threshold", () => {
    const nodes = [node("a", [0, 1]), node("b", [0, 1])];
    expect(resolveSeedsBySimilarity(nodes, [1, 0], { minScore: 0.5 })).toEqual([]);
  });
});
