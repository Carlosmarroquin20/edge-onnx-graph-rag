import { describe, expect, it } from "vitest";

import {
  assembleContext,
  estimateTokensByChars,
  type TokenEstimator,
} from "./contextAssembler.js";
import { asEdgeId, asNodeId } from "./ids.js";
import type {
  GraphEdge,
  GraphNode,
  PropertyBag,
  SubgraphResult,
} from "../types/graph.js";

function node(id: string, label: string, properties: PropertyBag = {}): GraphNode {
  return { id: asNodeId(id), type: "entity", label, properties };
}

function edge(
  id: string,
  source: string,
  target: string,
  relation: string,
  directed = true,
): GraphEdge {
  return {
    id: asEdgeId(id),
    source: asNodeId(source),
    target: asNodeId(target),
    relation,
    weight: 1,
    directed,
    properties: {},
  };
}

function subgraph(scores: ReadonlyArray<readonly [string, number]>): SubgraphResult {
  return {
    nodes: [
      node("a", "Alice"),
      node("b", "Bob"),
      node("c", "Carol"),
    ],
    edges: [
      edge("ab", "a", "b", "knows", true),
      edge("bc", "b", "c", "collaborates", false),
    ],
    scores: new Map(scores.map(([id, s]) => [asNodeId(id), s] as const)),
  };
}

const SCORES = [
  ["a", 1],
  ["b", 0.5],
  ["c", 1 / 3],
] as const;

describe("assembleContext", () => {
  it("serializes all nodes and relations within an ample budget", () => {
    const result = assembleContext(subgraph(SCORES), { tokenBudget: 1000 });

    expect(result.truncated).toBe(false);
    expect(result.includedNodes.map(String)).toEqual(["a", "b", "c"]);
    expect(result.text).toContain("- Alice [entity]");
    expect(result.text).toContain("- Alice -[knows]-> Bob");
    expect(result.text).toContain("- Bob -[collaborates]- Carol");
  });

  it("admits nodes in descending relevance and truncates to the budget", () => {
    const aliceLine = "- Alice [entity]";
    const budget = estimateTokensByChars(aliceLine);

    const result = assembleContext(subgraph(SCORES), { tokenBudget: budget });

    expect(result.includedNodes.map(String)).toEqual(["a"]);
    expect(result.truncated).toBe(true);
    expect(result.tokenCount).toBeLessThanOrEqual(budget);
  });

  it("drops relations whose endpoints were not admitted", () => {
    const budget = estimateTokensByChars("- Alice [entity]\n- Bob [entity]");

    const result = assembleContext(subgraph(SCORES), { tokenBudget: budget });

    expect(result.includedNodes.map(String)).toEqual(["a", "b"]);
    // The A->B edge fits both endpoints but exceeds the node-only budget; the
    // B-C edge references the dropped node C and is excluded outright.
    expect(result.text).not.toContain("Carol");
  });

  it("omits relations when includeEdges is false", () => {
    const result = assembleContext(subgraph(SCORES), {
      tokenBudget: 1000,
      includeEdges: false,
    });

    expect(result.text).not.toContain("->");
    expect(result.text).not.toContain("-[");
  });

  it("emits a header when provided", () => {
    const result = assembleContext(subgraph(SCORES), {
      tokenBudget: 1000,
      header: "Knowledge context:",
    });

    expect(result.text.startsWith("Knowledge context:\n")).toBe(true);
  });

  it("renders properties deterministically in sorted key order", () => {
    const withProps: SubgraphResult = {
      nodes: [node("a", "Alice", { role: "lead", age: 30, active: true })],
      edges: [],
      scores: new Map([[asNodeId("a"), 1]]),
    };

    const result = assembleContext(withProps, { tokenBudget: 1000 });

    expect(result.text).toContain("- Alice [entity] {active=true, age=30, role=lead}");
  });

  it("honors a custom token estimator", () => {
    const wordCount: TokenEstimator = (input) =>
      input.split(/\s+/).filter((token) => token.length > 0).length;

    const result = assembleContext(subgraph(SCORES), {
      tokenBudget: 1000,
      estimateTokens: wordCount,
    });

    expect(result.tokenCount).toBe(wordCount(result.text));
  });
});
