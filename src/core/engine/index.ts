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
