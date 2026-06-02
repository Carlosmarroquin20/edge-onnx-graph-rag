/** Seed content and defaults for the console's first run. */

export const DEFAULT_MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";

export type CorpusMode = "text" | "triples";

export const SAMPLE_TRIPLES = `Ada Lovelace | collaborated_with | Charles Babbage
Charles Babbage | designed | Analytical Engine
Ada Lovelace | wrote | First Algorithm
First Algorithm | targeted | Analytical Engine
Analytical Engine | is_a | Mechanical Computer`;

export const SAMPLE_TEXT = `Ada Lovelace collaborated with Charles Babbage on the Analytical Engine.
Babbage designed the Analytical Engine in London. Lovelace wrote the first
algorithm intended for the Analytical Engine, a mechanical computer.`;

export const SAMPLE_QUERY = "What did Ada Lovelace work on with Charles Babbage?";
