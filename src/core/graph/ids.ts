/**
 * Identifier helpers.
 *
 * `NodeId`/`EdgeId` are branded strings (see `types/graph.ts`); these are the
 * sanctioned entry points for crossing from raw strings into the branded domain,
 * with validation, plus a collision-resistant generator for synthetic ids.
 */

import type { EdgeId, NodeId } from "../types/graph.js";
import { GraphError } from "./errors.js";

/** Brands a non-empty string as a `NodeId`. */
export function asNodeId(value: string): NodeId {
  if (value.length === 0) {
    throw new GraphError("INVALID_ID", "A node id must be a non-empty string.");
  }
  return value as NodeId;
}

/** Brands a non-empty string as an `EdgeId`. */
export function asEdgeId(value: string): EdgeId {
  if (value.length === 0) {
    throw new GraphError("INVALID_ID", "An edge id must be a non-empty string.");
  }
  return value as EdgeId;
}

/**
 * Monotonic id generator scoped to a prefix. Synthetic ids combine the prefix
 * with a per-instance counter, yielding stable, ordered, collision-free ids
 * without the overhead of UUID generation for in-memory use.
 */
export class IdFactory {
  private counter = 0;

  constructor(private readonly prefix: string) {}

  nextNodeId(): NodeId {
    this.counter += 1;
    return asNodeId(`${this.prefix}:n:${this.counter}`);
  }

  nextEdgeId(): EdgeId {
    this.counter += 1;
    return asEdgeId(`${this.prefix}:e:${this.counter}`);
  }
}
