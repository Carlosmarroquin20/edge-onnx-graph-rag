/** Public barrel for the inference engine layer. */

export {
  detectCapabilities,
  readHostEnvironment,
  type ProbeEnvironment,
} from "./capabilities.js";

export {
  EngineFactory,
  selectBackend,
  type BackendConstructor,
  type EngineFactoryOptions,
} from "./EngineFactory.js";

export {
  createPushPullStream,
  type PushPullStream,
} from "./streaming.js";

// NOTE: `createEngine` and the concrete backends are intentionally not
// re-exported here — importing them pulls in the Transformers.js runtime.
// Import "./createEngine.js" directly when runtime inference is required.
