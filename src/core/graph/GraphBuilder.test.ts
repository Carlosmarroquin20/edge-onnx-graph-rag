import { describe, expect, it } from "vitest";

import { GraphBuilder } from "./GraphBuilder.js";
import { extractTriples } from "./extraction.js";

describe("GraphBuilder entity de-duplication", () => {
  it("reuses a node for labels that normalize to the same key", () => {
    const builder = new GraphBuilder();

    const first = builder.upsertEntity("Alice");
    const second = builder.upsertEntity("  alice ");

    expect(second).toBe(first);
    expect(builder.graph.nodeCount).toBe(1);
  });
});

describe("GraphBuilder relation accumulation", () => {
  it("accumulates weight when the same relation is asserted twice", () => {
    const builder = new GraphBuilder();

    const id = builder.relate("A", "knows", "B");
    const again = builder.relate("A", "knows", "B");

    expect(again).toBe(id);
    expect(builder.graph.edgeCount).toBe(1);
    expect(builder.graph.getEdge(id)?.weight).toBe(2);
  });

  it("treats an undirected relation symmetrically", () => {
    const builder = new GraphBuilder();

    const id = builder.relate("A", "co", "B", 1, false);
    builder.relate("B", "co", "A", 1, false);

    expect(builder.graph.edgeCount).toBe(1);
    expect(builder.graph.getEdge(id)?.weight).toBe(2);
  });

  it("keeps directed and undirected relations distinct", () => {
    const builder = new GraphBuilder();

    builder.relate("A", "r", "B", 1, true);
    builder.relate("A", "r", "B", 1, false);

    expect(builder.graph.edgeCount).toBe(2);
  });
});

describe("GraphBuilder ingestion", () => {
  it("materializes an extraction fragment into the store", () => {
    const builder = new GraphBuilder();

    builder.ingest(extractTriples("Alice | knows | Bob\nBob | founded | Acme"));

    expect(builder.graph.nodeCount).toBe(3);
    expect(builder.graph.edgeCount).toBe(2);
    const relations = [...builder.graph.edges()].map((e) => e.relation).sort();
    expect(relations).toEqual(["founded", "knows"]);
  });

  it("merges repeated relations across separate ingests", () => {
    const builder = new GraphBuilder();

    builder.ingest(extractTriples("Alice | knows | Bob"));
    builder.ingest(extractTriples("Alice | knows | Bob"));

    expect(builder.graph.edgeCount).toBe(1);
    const edge = [...builder.graph.edges()][0];
    expect(edge?.weight).toBe(2);
  });
});
