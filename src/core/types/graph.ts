/**
 * Knowledge Graph contracts.
 *
 * Typed nodes and edges for the in-memory Graph-RAG store. The store
 * implementation (adjacency lists, traversal) lands in Phase 2; these contracts
 * are stable across that work.
 */

/** Opaque identifiers. Branded to prevent accidental cross-assignment. */
export type NodeId = string & { readonly __brand: "NodeId" };
export type EdgeId = string & { readonly __brand: "EdgeId" };

/** Coarse entity taxonomy assigned during extraction. */
export type NodeType =
  | "entity"
  | "concept"
  | "document"
  | "chunk"
  | "attribute";

/** Arbitrary scalar metadata attached to nodes and edges. */
export type PropertyValue = string | number | boolean;
export type PropertyBag = Readonly<Record<string, PropertyValue>>;

/** A vertex in the knowledge graph. */
export interface GraphNode {
  readonly id: NodeId;
  readonly type: NodeType;
  /** Human-readable label / surface form. */
  readonly label: string;
  /**
   * Optional dense embedding for hybrid structural + semantic retrieval.
   * Length is model-dependent; the store does not enforce dimensionality.
   */
  readonly embedding?: ReadonlyArray<number>;
  readonly properties: PropertyBag;
}

/**
 * A relation between two nodes. Edges are directed; an undirected relation is
 * represented as a `directed: false` edge interpreted symmetrically by traversal.
 */
export interface GraphEdge {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
  /** Relation label (e.g. "mentions", "is-a", "part-of"). */
  readonly relation: string;
  /**
   * Association strength in `(0, ∞)`; higher means a stronger relation.
   * Weighted traversal converts this to a path cost via its reciprocal, so
   * stronger edges are "closer". Must be positive to participate in pathing.
   */
  readonly weight: number;
  readonly directed: boolean;
  readonly properties: PropertyBag;
}

/** Direction of edge expansion during traversal. */
export type TraversalDirection = "out" | "in" | "both";

/** Parameters for multi-hop neighborhood retrieval. */
export interface TraversalQuery {
  readonly start: ReadonlyArray<NodeId>;
  /** Maximum hop distance from any start node. */
  readonly maxHops: number;
  /** Cap on returned nodes to bound context size. */
  readonly limit?: number;
  /** Restrict expansion to these relation labels when provided. */
  readonly relations?: ReadonlyArray<string>;
  /**
   * Expansion direction. Undirected edges are always bidirectional; for
   * directed edges, `"both"` treats them as bidirectional for retrieval.
   * Defaults to `"both"`.
   */
  readonly direction?: TraversalDirection;
}

/** Result of a traversal: the induced subgraph plus per-node relevance. */
export interface SubgraphResult {
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
  /** Relevance score per node id, used to rank context packing. */
  readonly scores: ReadonlyMap<NodeId, number>;
}
