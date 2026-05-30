/** Public barrel for the knowledge graph layer. */

export { GraphStore, type Expansion } from "./GraphStore.js";

export {
  retrieveNeighborhood,
  weightedShortestPath,
  type ShortestPath,
  type ShortestPathOptions,
} from "./traversal.js";

export { asEdgeId, asNodeId, IdFactory } from "./ids.js";

export { GraphError, type GraphErrorCode } from "./errors.js";
