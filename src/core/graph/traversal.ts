/**
 * Graph traversal for Graph-RAG retrieval.
 *
 * Two primitives over {@link GraphStore}:
 *  - {@link retrieveNeighborhood}: breadth-first k-hop expansion producing a
 *    bounded, relevance-scored subgraph for context assembly.
 *  - {@link weightedShortestPath}: Dijkstra over reciprocal edge weights, so
 *    stronger associations form cheaper paths.
 */

import type {
  EdgeId,
  GraphEdge,
  GraphNode,
  NodeId,
  SubgraphResult,
  TraversalDirection,
  TraversalQuery,
} from "../types/graph.js";
import { GraphError } from "./errors.js";
import type { GraphStore } from "./GraphStore.js";

const DEFAULT_DIRECTION: TraversalDirection = "both";

function toRelationSet(
  relations: ReadonlyArray<string> | undefined,
): ReadonlySet<string> | undefined {
  return relations !== undefined && relations.length > 0
    ? new Set(relations)
    : undefined;
}

/**
 * Expands outward from the query's seed nodes up to `maxHops`, scoring each
 * reached node by proximity (`1 / (1 + hops)` at its shortest hop distance).
 * Results are ranked by score and truncated to `limit`; edges are restricted to
 * those whose endpoints both survive truncation. Unknown seeds are ignored.
 */
export function retrieveNeighborhood(
  store: GraphStore,
  query: TraversalQuery,
): SubgraphResult {
  const direction = query.direction ?? DEFAULT_DIRECTION;
  const relations = toRelationSet(query.relations);

  const hops = new Map<NodeId, number>();
  const incidentEdges = new Set<EdgeId>();
  const queue: Array<{ readonly node: NodeId; readonly hop: number }> = [];

  for (const seed of query.start) {
    if (store.hasNode(seed) && !hops.has(seed)) {
      hops.set(seed, 0);
      queue.push({ node: seed, hop: 0 });
    }
  }

  let head = 0;
  while (head < queue.length) {
    const item = queue[head];
    head += 1;
    if (item === undefined || item.hop >= query.maxHops) {
      continue;
    }
    for (const { edge, neighbor } of store.expand(item.node, direction, relations)) {
      incidentEdges.add(edge.id);
      if (!hops.has(neighbor)) {
        hops.set(neighbor, item.hop + 1);
        queue.push({ node: neighbor, hop: item.hop + 1 });
      }
    }
  }

  const ranked = [...hops.entries()]
    .map(([id, hop]) => ({ id, score: 1 / (1 + hop) }))
    .sort((a, b) => b.score - a.score);
  const selected =
    query.limit !== undefined ? ranked.slice(0, query.limit) : ranked;

  const keep = new Set<NodeId>(selected.map((entry) => entry.id));
  const nodes: GraphNode[] = [];
  const scores = new Map<NodeId, number>();
  for (const entry of selected) {
    const node = store.getNode(entry.id);
    if (node !== undefined) {
      nodes.push(node);
      scores.set(entry.id, entry.score);
    }
  }

  const edges: GraphEdge[] = [];
  for (const edgeId of incidentEdges) {
    const edge = store.getEdge(edgeId);
    if (edge !== undefined && keep.has(edge.source) && keep.has(edge.target)) {
      edges.push(edge);
    }
  }

  return { nodes, edges, scores };
}

export interface ShortestPath {
  /** Ordered node sequence from source to target, inclusive. */
  readonly path: ReadonlyArray<NodeId>;
  /** Total path cost (sum of reciprocal edge weights). */
  readonly cost: number;
}

export interface ShortestPathOptions {
  readonly direction?: TraversalDirection;
  readonly relations?: ReadonlyArray<string>;
}

/**
 * Computes the minimum-cost path from `source` to `target` where each edge costs
 * `1 / weight`. Returns `null` when the target is unreachable. Throws
 * `MISSING_NODE` if either endpoint is absent.
 */
export function weightedShortestPath(
  store: GraphStore,
  source: NodeId,
  target: NodeId,
  options: ShortestPathOptions = {},
): ShortestPath | null {
  if (!store.hasNode(source)) {
    throw new GraphError("MISSING_NODE", `Source node "${source}" does not exist.`);
  }
  if (!store.hasNode(target)) {
    throw new GraphError("MISSING_NODE", `Target node "${target}" does not exist.`);
  }
  if (source === target) {
    return { path: [source], cost: 0 };
  }

  const direction = options.direction ?? DEFAULT_DIRECTION;
  const relations = toRelationSet(options.relations);

  const dist = new Map<NodeId, number>([[source, 0]]);
  const prev = new Map<NodeId, NodeId>();
  const frontier = new MinHeap();
  frontier.push(source, 0);

  while (frontier.size > 0) {
    const current = frontier.pop();
    if (current === undefined) {
      break;
    }
    const settled = dist.get(current.key);
    // Skip stale heap entries superseded by a cheaper relaxation.
    if (settled === undefined || current.priority > settled) {
      continue;
    }
    if (current.key === target) {
      break;
    }
    for (const { edge, neighbor } of store.expand(current.key, direction, relations)) {
      if (!(edge.weight > 0)) {
        continue;
      }
      const candidate = settled + 1 / edge.weight;
      const known = dist.get(neighbor);
      if (known === undefined || candidate < known) {
        dist.set(neighbor, candidate);
        prev.set(neighbor, current.key);
        frontier.push(neighbor, candidate);
      }
    }
  }

  const total = dist.get(target);
  if (total === undefined) {
    return null;
  }

  const path: NodeId[] = [];
  let cursor: NodeId | undefined = target;
  while (cursor !== undefined) {
    path.push(cursor);
    cursor = prev.get(cursor);
  }
  path.reverse();
  return { path, cost: total };
}

interface HeapEntry {
  readonly key: NodeId;
  readonly priority: number;
}

/** Binary min-heap keyed on priority; supports lazy decrease-key via re-push. */
class MinHeap {
  private readonly items: HeapEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(key: NodeId, priority: number): void {
    const items = this.items;
    items.push({ key, priority });
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      const child = items[index];
      const ancestor = items[parent];
      if (child === undefined || ancestor === undefined || ancestor.priority <= child.priority) {
        break;
      }
      items[index] = ancestor;
      items[parent] = child;
      index = parent;
    }
  }

  pop(): HeapEntry | undefined {
    const items = this.items;
    const top = items[0];
    if (top === undefined) {
      return undefined;
    }
    const last = items.pop();
    if (last !== undefined && items.length > 0) {
      items[0] = last;
      this.siftDown();
    }
    return top;
  }

  private siftDown(): void {
    const items = this.items;
    const length = items.length;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      let smallest = index;
      const current = items[smallest];
      const leftEntry = left < length ? items[left] : undefined;
      if (leftEntry !== undefined && current !== undefined && leftEntry.priority < current.priority) {
        smallest = left;
      }
      const pivot = items[smallest];
      const rightEntry = right < length ? items[right] : undefined;
      if (rightEntry !== undefined && pivot !== undefined && rightEntry.priority < pivot.priority) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }
      const a = items[index];
      const b = items[smallest];
      if (a === undefined || b === undefined) {
        break;
      }
      items[index] = b;
      items[smallest] = a;
      index = smallest;
    }
  }
}
