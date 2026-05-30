import { describe, expect, it } from "vitest";

import { GraphStore } from "./GraphStore.js";
import { GraphError } from "./errors.js";
import { asEdgeId, asNodeId } from "./ids.js";
import { retrieveNeighborhood, weightedShortestPath } from "./traversal.js";
import type { GraphEdge, GraphNode, NodeId } from "../types/graph.js";

function node(id: string): GraphNode {
  return { id: asNodeId(id), type: "entity", label: id, properties: {} };
}

function edge(
  id: string,
  source: string,
  target: string,
  overrides: Partial<Pick<GraphEdge, "relation" | "weight" | "directed">> = {},
): GraphEdge {
  return {
    id: asEdgeId(id),
    source: asNodeId(source),
    target: asNodeId(target),
    relation: overrides.relation ?? "rel",
    weight: overrides.weight ?? 1,
    directed: overrides.directed ?? true,
    properties: {},
  };
}

/** Builds an undirected chain A-B-C-D with unit weights. */
function chain(): GraphStore {
  const store = new GraphStore();
  for (const id of ["A", "B", "C", "D"]) {
    store.addNode(node(id));
  }
  store.addEdge(edge("ab", "A", "B", { directed: false }));
  store.addEdge(edge("bc", "B", "C", { directed: false }));
  store.addEdge(edge("cd", "C", "D", { directed: false }));
  return store;
}

function ids(nodes: ReadonlyArray<GraphNode>): string[] {
  return nodes.map((n) => n.label);
}

describe("retrieveNeighborhood", () => {
  it("expands up to maxHops and scores by proximity", () => {
    const store = chain();

    const result = retrieveNeighborhood(store, {
      start: [asNodeId("A")],
      maxHops: 2,
    });

    expect(new Set(ids(result.nodes))).toEqual(new Set(["A", "B", "C"]));
    expect(result.scores.get(asNodeId("A"))).toBeCloseTo(1);
    expect(result.scores.get(asNodeId("B"))).toBeCloseTo(0.5);
    expect(result.scores.get(asNodeId("C"))).toBeCloseTo(1 / 3);
    // D is one hop beyond the horizon.
    expect(result.scores.has(asNodeId("D"))).toBe(false);
  });

  it("ranks by score and truncates to the node limit", () => {
    const store = chain();

    const result = retrieveNeighborhood(store, {
      start: [asNodeId("A")],
      maxHops: 3,
      limit: 2,
    });

    expect(ids(result.nodes)).toEqual(["A", "B"]);
    // Only edges whose endpoints both survive truncation are retained.
    expect(result.edges.map((e) => e.id)).toEqual([asEdgeId("ab")]);
  });

  it("ignores unknown seed nodes", () => {
    const store = chain();

    const result = retrieveNeighborhood(store, {
      start: [asNodeId("A"), asNodeId("ghost")],
      maxHops: 1,
    });

    expect(new Set(ids(result.nodes))).toEqual(new Set(["A", "B"]));
  });

  it("respects expansion direction on directed edges", () => {
    const store = new GraphStore();
    for (const id of ["A", "B", "C"]) {
      store.addNode(node(id));
    }
    store.addEdge(edge("ab", "A", "B", { directed: true }));
    store.addEdge(edge("bc", "B", "C", { directed: true }));

    const outward = retrieveNeighborhood(store, {
      start: [asNodeId("A")],
      maxHops: 2,
      direction: "out",
    });
    const inward = retrieveNeighborhood(store, {
      start: [asNodeId("A")],
      maxHops: 2,
      direction: "in",
    });

    expect(new Set(ids(outward.nodes))).toEqual(new Set(["A", "B", "C"]));
    expect(ids(inward.nodes)).toEqual(["A"]);
  });
});

describe("weightedShortestPath", () => {
  it("prefers the path of stronger associations (lower reciprocal cost)", () => {
    const store = new GraphStore();
    for (const id of ["A", "B", "C", "D"]) {
      store.addNode(node(id));
    }
    // Two routes A→D: weak two-hop (cost 2) vs strong two-hop (cost 1).
    store.addEdge(edge("ab", "A", "B", { weight: 1 }));
    store.addEdge(edge("bd", "B", "D", { weight: 1 }));
    store.addEdge(edge("ac", "A", "C", { weight: 2 }));
    store.addEdge(edge("cd", "C", "D", { weight: 2 }));

    const result = weightedShortestPath(store, asNodeId("A"), asNodeId("D"), {
      direction: "out",
    });

    expect(result).not.toBeNull();
    const path = result as NonNullable<typeof result>;
    expect(path.path.map((id) => String(id))).toEqual(["A", "C", "D"]);
    expect(path.cost).toBeCloseTo(1);
  });

  it("returns a zero-cost trivial path when source equals target", () => {
    const store = chain();
    const result = weightedShortestPath(store, asNodeId("A"), asNodeId("A"));

    expect(result).toEqual({ path: [asNodeId("A")], cost: 0 });
  });

  it("returns null when the target is unreachable", () => {
    const store = chain();
    store.addNode(node("isolated"));

    const result = weightedShortestPath(
      store,
      asNodeId("A"),
      asNodeId("isolated"),
    );

    expect(result).toBeNull();
  });

  it("throws MISSING_NODE for an absent endpoint", () => {
    const store = chain();

    const call = (): unknown =>
      weightedShortestPath(store, asNodeId("A"), asNodeId("nope") as NodeId);

    expect(call).toThrowError(GraphError);
  });
});
