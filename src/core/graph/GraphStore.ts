/**
 * In-memory knowledge graph store.
 *
 * Backed by entity maps plus dual adjacency indexes (outgoing/incoming) keyed by
 * edge id, giving O(1) node/edge lookup and O(degree) neighborhood expansion
 * without scanning the edge set. Endpoint integrity is enforced on insertion and
 * preserved on removal (deleting a node cascades to its incident edges).
 */

import type {
  EdgeId,
  GraphEdge,
  GraphNode,
  NodeId,
  TraversalDirection,
} from "../types/graph.js";
import { GraphError } from "./errors.js";

/** A single expansion step: an incident edge and the node it leads to. */
export interface Expansion {
  readonly edge: GraphEdge;
  readonly neighbor: NodeId;
}

export class GraphStore {
  private readonly nodesById = new Map<NodeId, GraphNode>();
  private readonly edgesById = new Map<EdgeId, GraphEdge>();
  /** node → ids of edges whose `source` is the node. */
  private readonly outgoing = new Map<NodeId, Set<EdgeId>>();
  /** node → ids of edges whose `target` is the node. */
  private readonly incoming = new Map<NodeId, Set<EdgeId>>();

  get nodeCount(): number {
    return this.nodesById.size;
  }

  get edgeCount(): number {
    return this.edgesById.size;
  }

  /** Inserts a node. Throws `DUPLICATE_NODE` if the id is already present. */
  addNode(node: GraphNode): void {
    if (this.nodesById.has(node.id)) {
      throw new GraphError("DUPLICATE_NODE", `Node "${node.id}" already exists.`);
    }
    this.nodesById.set(node.id, node);
    this.outgoing.set(node.id, new Set());
    this.incoming.set(node.id, new Set());
  }

  hasNode(id: NodeId): boolean {
    return this.nodesById.has(id);
  }

  getNode(id: NodeId): GraphNode | undefined {
    return this.nodesById.get(id);
  }

  /**
   * Removes a node and cascades to all incident edges. Returns `false` if the
   * node did not exist.
   */
  removeNode(id: NodeId): boolean {
    if (!this.nodesById.has(id)) {
      return false;
    }
    const incident = new Set<EdgeId>();
    for (const edgeId of this.outgoing.get(id) ?? []) {
      incident.add(edgeId);
    }
    for (const edgeId of this.incoming.get(id) ?? []) {
      incident.add(edgeId);
    }
    for (const edgeId of incident) {
      this.removeEdge(edgeId);
    }
    this.nodesById.delete(id);
    this.outgoing.delete(id);
    this.incoming.delete(id);
    return true;
  }

  /**
   * Inserts an edge. Throws `MISSING_ENDPOINT` if either endpoint is absent and
   * `DUPLICATE_EDGE` if the id is already present.
   */
  addEdge(edge: GraphEdge): void {
    const out = this.outgoing.get(edge.source);
    const inc = this.incoming.get(edge.target);
    if (out === undefined || inc === undefined) {
      throw new GraphError(
        "MISSING_ENDPOINT",
        `Edge "${edge.id}" references an unknown endpoint (${edge.source} → ${edge.target}).`,
      );
    }
    if (this.edgesById.has(edge.id)) {
      throw new GraphError("DUPLICATE_EDGE", `Edge "${edge.id}" already exists.`);
    }
    this.edgesById.set(edge.id, edge);
    out.add(edge.id);
    inc.add(edge.id);
  }

  hasEdge(id: EdgeId): boolean {
    return this.edgesById.has(id);
  }

  getEdge(id: EdgeId): GraphEdge | undefined {
    return this.edgesById.get(id);
  }

  /** Removes an edge and its adjacency entries. Returns `false` if absent. */
  removeEdge(id: EdgeId): boolean {
    const edge = this.edgesById.get(id);
    if (edge === undefined) {
      return false;
    }
    this.outgoing.get(edge.source)?.delete(id);
    this.incoming.get(edge.target)?.delete(id);
    this.edgesById.delete(id);
    return true;
  }

  /** Read-only iteration over all nodes, in insertion order. */
  nodes(): IterableIterator<GraphNode> {
    return this.nodesById.values();
  }

  /** Read-only iteration over all edges, in insertion order. */
  edges(): IterableIterator<GraphEdge> {
    return this.edgesById.values();
  }

  /**
   * Yields the neighbors reachable from `id` in one hop, honoring direction and
   * an optional relation-label filter. Undirected edges are bidirectional; under
   * `"both"`, directed edges are traversed in either orientation.
   */
  *expand(
    id: NodeId,
    direction: TraversalDirection,
    relations?: ReadonlySet<string>,
  ): IterableIterator<Expansion> {
    const followsOut = direction === "out" || direction === "both";
    const followsIn = direction === "in" || direction === "both";

    for (const edgeId of this.outgoing.get(id) ?? []) {
      const edge = this.edgesById.get(edgeId);
      if (edge === undefined) {
        continue;
      }
      if (relations !== undefined && !relations.has(edge.relation)) {
        continue;
      }
      if (followsOut || !edge.directed) {
        yield { edge, neighbor: edge.target };
      }
    }

    for (const edgeId of this.incoming.get(id) ?? []) {
      const edge = this.edgesById.get(edgeId);
      if (edge === undefined) {
        continue;
      }
      if (relations !== undefined && !relations.has(edge.relation)) {
        continue;
      }
      if (followsIn || !edge.directed) {
        yield { edge, neighbor: edge.source };
      }
    }
  }
}
