import { describe, expect, it } from "vitest";

import { extractByCooccurrence, extractTriples } from "./extraction.js";

function labels(nodes: ReadonlyArray<{ label: string }>): Set<string> {
  return new Set(nodes.map((n) => n.label));
}

describe("extractTriples", () => {
  it("parses subject | predicate | object lines into directed edges", () => {
    const result = extractTriples("Alice | knows | Bob\nBob | founded | Acme");

    expect(labels(result.nodes)).toEqual(new Set(["Alice", "Bob", "Acme"]));
    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]).toMatchObject({
      source: "Alice",
      relation: "knows",
      target: "Bob",
      directed: true,
    });
  });

  it("skips blank and malformed lines", () => {
    const result = extractTriples("\nAlice | knows | Bob\nonlyonefield\n   \n");

    expect(result.edges).toHaveLength(1);
    expect(labels(result.nodes)).toEqual(new Set(["Alice", "Bob"]));
  });

  it("falls back to the default relation for two-field lines", () => {
    const result = extractTriples("Alice | Bob");

    expect(result.edges[0]?.relation).toBe("related_to");
  });

  it("de-duplicates entities by normalized label", () => {
    const result = extractTriples("Alice | knows | Bob\nalice | likes | Carol");

    expect(result.nodes).toHaveLength(3);
    expect(labels(result.nodes)).toEqual(new Set(["Alice", "Bob", "Carol"]));
  });

  it("honors a custom delimiter", () => {
    const result = extractTriples("X -> rel -> Y", { delimiter: "->" });

    expect(result.edges[0]).toMatchObject({ source: "X", relation: "rel", target: "Y" });
  });
});

describe("extractByCooccurrence", () => {
  it("links proper nouns co-occurring in a sentence with undirected edges", () => {
    const result = extractByCooccurrence("Alice met Bob in Paris. Carol joined.");

    expect(labels(result.nodes)).toEqual(new Set(["Alice", "Bob", "Paris", "Carol"]));
    // Sentence 1 yields the three pairwise links; sentence 2 has a single entity.
    expect(result.edges).toHaveLength(3);
    expect(result.edges.every((e) => e.directed === false)).toBe(true);
    expect(result.edges.every((e) => e.relation === "co-occurs")).toBe(true);
  });

  it("captures multi-word proper nouns as a single entity", () => {
    const result = extractByCooccurrence("Acme Corp hired Bob.");

    expect(labels(result.nodes)).toEqual(new Set(["Acme Corp", "Bob"]));
  });

  it("filters sentence-initial single-word stopwords", () => {
    const result = extractByCooccurrence("Bob arrived. The end.");

    expect(labels(result.nodes)).toEqual(new Set(["Bob"]));
  });
});
