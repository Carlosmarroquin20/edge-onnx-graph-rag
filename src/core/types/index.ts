/** Public barrel for core type contracts. */

export type {
  BackendKind,
  CapabilityReport,
  EngineConfig,
  GenerationOptions,
  GenerationResult,
  GenerationToken,
  InferenceEngine,
} from "./inference.js";

export type {
  AggregatedMetrics,
  ExecutionMetrics,
} from "./metrics.js";

export type {
  EdgeId,
  GraphEdge,
  GraphNode,
  NodeId,
  NodeType,
  PropertyBag,
  PropertyValue,
  SubgraphResult,
  TraversalDirection,
  TraversalQuery,
} from "./graph.js";

export type { EngineErrorCode } from "./errors.js";
export { EngineError, NoBackendAvailableError } from "./errors.js";
