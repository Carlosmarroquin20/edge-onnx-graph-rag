import { describe, expect, it } from "vitest";

import { GraphStore } from "./GraphStore.js";
import { GraphError } from "./errors.js";
import { asEdgeId, asNodeId } from "./ids.js";
import type { GraphEdge, GraphNode } from "../types/graph.js";

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

function neighborsOf(
  store: GraphStore,
  id: string,
  direction: "out" | "in" | "both",
): string[] {
  return [...store.expand(asNodeId(id), direction)].map((step) => step.neighbor);
}

describe("GraphStore node lifecycle", () => {
  it("inserts and retrieves nodes", () => {
    const store = new GraphStore();
    store.addNode(node("A"));

    expect(store.hasNode(asNodeId("A"))).toBe(true);
    expect(store.getNode(asNodeId("A"))?.label).toBe("A");
    expect(store.nodeCount).toBe(1);
  });

  it("rejects duplicate node ids", () => {
    const store = new GraphStore();
    store.addNode(node("A"));

    expect(() => store.addNode(node("A"))).toThrowError(GraphError);
  });

  it("removes a node and cascades to incident edges", () => {
    const store = new GraphStore();
    store.addNode(node("A"));
    store.addNode(node("B"));
    store.addEdge(edge("e1", "A", "B"));

    expect(store.removeNode(asNodeId("A"))).toBe(true);
    expect(store.hasNode(asNodeId("A"))).toBe(false);
    expect(store.hasEdge(asEdgeId("e1"))).toBe(false);
    expect(store.edgeCount).toBe(0);
    expect(neighborsOf(store, "B", "both")).toEqual([]);
  });

  it("returns false when removing an absent node", () => {
    const store = new GraphStore();
    expect(store.removeNode(asNodeId("ghost"))).toBe(false);
  });
});

describe("GraphStore edge lifecycle", () => {
  it("rejects edges with an unknown endpoint", () => {
    const store = new GraphStore();
    store.addNode(node("A"));

    expect(() => store.addEdge(edge("e1", "A", "B"))).toThrowError(GraphError);
    try {
      store.addEdge(edge("e1", "A", "B"));
    } catch (caught) {
      expect(caught).toBeInstanceOf(GraphError);
      expect((caught as GraphError).code).toBe("MISSING_ENDPOINT");
    }
  });

  it("rejects duplicate edge ids", () => {
    const store = new GraphStore();
    store.addNode(node("A"));
    store.addNode(node("B"));
    store.addEdge(edge("e1", "A", "B"));

    expect(() => store.addEdge(edge("e1", "A", "B"))).toThrowError(GraphError);
  });

  it("removes an edge and clears adjacency", () => {
    const store = new GraphStore();
    store.addNode(node("A"));
    store.addNode(node("B"));
    store.addEdge(edge("e1", "A", "B"));

    expect(store.removeEdge(asEdgeId("e1"))).toBe(true);
    expect(neighborsOf(store, "A", "out")).toEqual([]);
    expect(store.edgeCount).toBe(0);
  });
});

describe("GraphStore.expand direction semantics", () => {
  it("follows a directed edge only in its orientation", () => {
    const store = new GraphStore();
    store.addNode(node("A"));
    store.addNode(node("B"));
    store.addEdge(edge("e1", "A", "B", { directed: true }));

    expect(neighborsOf(store, "A", "out")).toEqual(["B"]);
    expect(neighborsOf(store, "A", "in")).toEqual([]);
    expect(neighborsOf(store, "B", "in")).toEqual(["A"]);
    expect(neighborsOf(store, "B", "out")).toEqual([]);
    expect(neighborsOf(store, "A", "both")).toEqual(["B"]);
    expect(neighborsOf(store, "B", "both")).toEqual(["A"]);
  });

  it("treats an undirected edge as bidirectional regardless of direction", () => {
    const store = new GraphStore();
    store.addNode(node("A"));
    store.addNode(node("B"));
    store.addEdge(edge("e1", "A", "B", { directed: false }));

    expect(neighborsOf(store, "A", "out")).toEqual(["B"]);
    expect(neighborsOf(store, "B", "out")).toEqual(["A"]);
  });

  it("filters expansion by relation label", () => {
    const store = new GraphStore();
    store.addNode(node("A"));
    store.addNode(node("B"));
    store.addNode(node("C"));
    store.addEdge(edge("e1", "A", "B", { relation: "mentions" }));
    store.addEdge(edge("e2", "A", "C", { relation: "cites" }));

    const mentions = [
      ...store.expand(asNodeId("A"), "out", new Set(["mentions"])),
    ].map((step) => step.neighbor);

    expect(mentions).toEqual(["B"]);
  });
});
