/**
 * Semantic similarity and hybrid re-ranking for Graph-RAG retrieval.
 *
 * Structural retrieval (k-hop proximity) answers "what is connected to the
 * seeds"; semantic re-ranking answers "what is about the query", by comparing a
 * query embedding against each node's embedding. Blending the two reorders
 * context packing by combined relevance, so a structurally-near but off-topic
 * node yields to a slightly-farther but on-topic one.
 *
 * Pure and dependency-free: the embeddings themselves are produced elsewhere (a
 * feature-extraction model) and supplied here as plain number arrays, so this
 * module is fully unit-testable without a model.
 */

import type { GraphNode, NodeId, SubgraphResult } from "../types/graph.js";

/**
 * Cosine similarity of two dense vectors, in `[-1, 1]`. Returns `0` when either
 * vector is empty, has zero magnitude, or the lengths differ — a missing or
 * degenerate embedding then contributes no semantic signal rather than
 * corrupting the ranking.
 */
export function cosineSimilarity(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>,
): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RerankOptions {
  /**
   * Weight on the structural score, in `[0, 1]`; the semantic score takes the
   * complement `1 - structuralWeight`. Defaults to `0.5` (balanced). `1` is pure
   * structural (a no-op); `0` is pure semantic.
   */
  readonly structuralWeight?: number;
}

const DEFAULT_STRUCTURAL_WEIGHT = 0.5;

function isValidEmbedding(v: ReadonlyArray<number> | undefined): v is ReadonlyArray<number> {
  return v !== undefined && v.length > 0;
}

/**
 * Blends each node's structural score with the cosine similarity of its
 * embedding to `queryEmbedding`, returning a new {@link SubgraphResult} whose
 * scores are the convex combination. Structural scores are min-max normalized to
 * `[0, 1]` so the two signals are comparable; semantic scores clamp negatives to
 * `0`. A node without a usable embedding keeps its normalized structural score
 * only (it is neither rewarded nor penalized by the semantic term). Nodes and
 * edges are returned unchanged.
 *
 * When `queryEmbedding` is empty or `structuralWeight` is `1`, the semantic term
 * cannot contribute and the original scores are returned unchanged.
 */
export function rerankBySimilarity(
  subgraph: SubgraphResult,
  queryEmbedding: ReadonlyArray<number>,
  options: RerankOptions = {},
): SubgraphResult {
  const weight = clamp01(options.structuralWeight ?? DEFAULT_STRUCTURAL_WEIGHT);
  if (!isValidEmbedding(queryEmbedding) || weight === 1) {
    return subgraph;
  }

  const values = [...subgraph.scores.values()];
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const span = max - min;

  const scores = new Map<NodeId, number>();
  for (const node of subgraph.nodes) {
    const structuralRaw = subgraph.scores.get(node.id) ?? 0;
    // Min-max normalize; when all structural scores are equal, treat them as
    // uniformly maximal (the structural signal is uninformative here).
    const structural = span > 0 ? (structuralRaw - min) / span : 1;

    if (!isValidEmbedding(node.embedding)) {
      scores.set(node.id, structural);
      continue;
    }
    const semantic = Math.max(0, cosineSimilarity(queryEmbedding, node.embedding));
    scores.set(node.id, weight * structural + (1 - weight) * semantic);
  }

  return { nodes: subgraph.nodes, edges: subgraph.edges, scores };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_STRUCTURAL_WEIGHT;
  }
  return Math.min(1, Math.max(0, value));
}

export interface SemanticSeedOptions {
  /** Maximum seeds to return, highest similarity first. Defaults to `3`. */
  readonly topK?: number;
  /**
   * Minimum cosine similarity a node must reach to anchor retrieval, in
   * `[-1, 1]`. Guards against anchoring on unrelated nodes when the query has no
   * semantic match in the graph. Defaults to `0.25`.
   */
  readonly minScore?: number;
}

const DEFAULT_SEED_TOP_K = 3;
const DEFAULT_SEED_MIN_SCORE = 0.25;

/**
 * Selects seed nodes by semantic similarity to the query embedding: the highest-
 * scoring embedded nodes above `minScore`, capped at `topK`. Complements exact
 * label matching — a query with no graph-resident proper noun (e.g. a
 * description rather than a name) can still anchor retrieval by meaning. Nodes
 * without an embedding are skipped; an empty query embedding yields no seeds.
 */
export function resolveSeedsBySimilarity(
  nodes: ReadonlyArray<GraphNode>,
  queryEmbedding: ReadonlyArray<number>,
  options: SemanticSeedOptions = {},
): NodeId[] {
  if (queryEmbedding.length === 0) {
    return [];
  }
  const topK = Math.max(0, options.topK ?? DEFAULT_SEED_TOP_K);
  const minScore = options.minScore ?? DEFAULT_SEED_MIN_SCORE;

  const scored: Array<{ readonly id: NodeId; readonly score: number }> = [];
  for (const node of nodes) {
    if (!isValidEmbedding(node.embedding)) {
      continue;
    }
    const score = cosineSimilarity(queryEmbedding, node.embedding);
    if (score >= minScore) {
      scored.push({ id: node.id, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((entry) => entry.id);
}
