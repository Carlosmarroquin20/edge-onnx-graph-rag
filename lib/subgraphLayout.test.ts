import { describe, expect, it } from "vitest";

import { asEdgeId, asNodeId } from "@core/graph";
import type { GraphEdge, GraphNode, NodeId } from "@core/types";

import { HEIGHT, WIDTH, computeLayout, radiusFor } from "./subgraphLayout.js";

function node(id: string, label = id): GraphNode {
  return { id: asNodeId(id), type: "entity", label, properties: {} };
}

function edge(id: string, source: string, target: string): GraphEdge {
  return {
    id: asEdgeId(id),
    source: asNodeId(source),
    target: asNodeId(target),
    relation: "rel",
    weight: 1,
    directed: true,
    properties: {},
  };
}

const chain = {
  nodes: [node("n1"), node("n2"), node("n3"), node("n4")],
  edges: [edge("e1", "n1", "n2"), edge("e2", "n2", "n3"), edge("e3", "n3", "n4")],
};

describe("computeLayout", () => {
  it("returns an empty map for an empty subgraph", () => {
    expect(computeLayout([], []).size).toBe(0);
  });

  it("centers a single node", () => {
    const layout = computeLayout([node("solo")], []);
    expect(layout.size).toBe(1);
    expect(layout.get(asNodeId("solo"))).toEqual({ x: WIDTH / 2, y: HEIGHT / 2 });
  });

  it("is deterministic — identical input yields identical positions", () => {
    const a = computeLayout(chain.nodes, chain.edges);
    const b = computeLayout(chain.nodes, chain.edges);
    expect(a).toEqual(b);
  });

  it("places every node within the drawing surface with finite coordinates", () => {
    const layout = computeLayout(chain.nodes, chain.edges);
    expect(layout.size).toBe(chain.nodes.length);
    for (const p of layout.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(WIDTH);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(HEIGHT);
    }
  });

  it("separates two connected nodes to distinct positions", () => {
    const layout = computeLayout([node("a"), node("b")], [edge("e", "a", "b")]);
    const a = layout.get(asNodeId("a"));
    const b = layout.get(asNodeId("b"));
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toEqual(b);
  });

  it("ignores edges whose endpoints are absent from the node set", () => {
    const layout = computeLayout(
      [node("a"), node("b")],
      [edge("dangling", "a", "ghost")],
    );
    expect(layout.size).toBe(2);
    for (const p of layout.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe("radiusFor", () => {
  const id = asNodeId("x") as NodeId;

  it("falls back to a default radius when the score is missing", () => {
    expect(radiusFor(id, new Map(), { min: 0, max: 1 })).toBe(8);
  });

  it("falls back to a default radius when all scores are equal", () => {
    expect(radiusFor(id, new Map([[id, 5]]), { min: 5, max: 5 })).toBe(8);
  });

  it("interpolates within [7, 14] across the score range", () => {
    const scores = new Map([[id, 5]]);
    expect(radiusFor(id, scores, { min: 0, max: 10 })).toBeCloseTo(10.5);
    expect(radiusFor(id, new Map([[id, 0]]), { min: 0, max: 10 })).toBe(7);
    expect(radiusFor(id, new Map([[id, 10]]), { min: 0, max: 10 })).toBe(14);
  });
});
