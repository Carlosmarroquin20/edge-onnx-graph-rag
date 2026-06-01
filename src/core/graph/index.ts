/** Public barrel for the knowledge graph layer. */

export { GraphStore, type Expansion } from "./GraphStore.js";

export {
  retrieveNeighborhood,
  weightedShortestPath,
  type ShortestPath,
  type ShortestPathOptions,
} from "./traversal.js";

export {
  assembleContext,
  estimateTokensByChars,
  type AssembledContext,
  type ContextAssemblyOptions,
  type TokenEstimator,
} from "./contextAssembler.js";

export { asEdgeId, asNodeId, IdFactory } from "./ids.js";

export {
  extractByCooccurrence,
  extractTriples,
  normalizeLabel,
  type CooccurrenceExtractionOptions,
  type EntityExtractor,
  type ExtractedEdge,
  type ExtractedNode,
  type ExtractionResult,
  type TripleExtractionOptions,
} from "./extraction.js";

export { GraphBuilder, type GraphBuilderOptions } from "./GraphBuilder.js";

export { GraphError, type GraphErrorCode } from "./errors.js";
