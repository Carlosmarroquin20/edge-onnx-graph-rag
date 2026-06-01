/**
 * Entity extraction.
 *
 * Converts unstructured text and structured model output into graph fragments
 * (label-keyed nodes and edges) without any external NLP dependency. Two
 * dependency-free strategies are provided:
 *
 *  - {@link extractTriples}: parses delimited `subject | predicate | object`
 *    lines — the canonical shape for relations emitted by an instructed model.
 *  - {@link extractByCooccurrence}: a proper-noun + sentence co-occurrence
 *    heuristic for free-form source documents.
 *
 * Output is intentionally label-keyed (not id-keyed): id minting and de-duplication
 * are the ingestor's responsibility (see `GraphBuilder`).
 */

import type { NodeType, PropertyBag } from "../types/graph.js";

export interface ExtractedNode {
  readonly label: string;
  readonly type: NodeType;
  readonly properties?: PropertyBag;
}

export interface ExtractedEdge {
  readonly source: string;
  readonly target: string;
  readonly relation: string;
  readonly weight?: number;
  readonly directed?: boolean;
}

export interface ExtractionResult {
  readonly nodes: ReadonlyArray<ExtractedNode>;
  readonly edges: ReadonlyArray<ExtractedEdge>;
}

/** An extraction strategy: pure text in, graph fragment out. */
export type EntityExtractor = (text: string) => ExtractionResult;

/** Canonical label key for de-duplication: trimmed, collapsed, case-folded. */
export function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface TripleExtractionOptions {
  /** Field delimiter within a line. Defaults to `"|"`. */
  readonly delimiter?: string;
  /** Relation label applied when a line carries only two fields. */
  readonly defaultRelation?: string;
}

/**
 * Parses one relation per line. A line with three fields yields
 * `subject -relation-> object`; a two-field line falls back to
 * `defaultRelation`. Blank lines and lines with empty fields are skipped.
 */
export function extractTriples(
  text: string,
  options: TripleExtractionOptions = {},
): ExtractionResult {
  const delimiter = options.delimiter ?? "|";
  const defaultRelation = options.defaultRelation ?? "related_to";

  const labels = new Map<string, ExtractedNode>();
  const edges: ExtractedEdge[] = [];

  const register = (label: string): void => {
    const key = normalizeLabel(label);
    if (!labels.has(key)) {
      labels.set(key, { label, type: "entity" });
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const fields = rawLine
      .split(delimiter)
      .map((field) => field.trim())
      .filter((field) => field.length > 0);

    let source: string | undefined;
    let relation: string | undefined;
    let target: string | undefined;
    if (fields.length === 3) {
      [source, relation, target] = fields;
    } else if (fields.length === 2) {
      [source, target] = fields;
      relation = defaultRelation;
    } else {
      continue;
    }
    if (source === undefined || target === undefined || relation === undefined) {
      continue;
    }

    register(source);
    register(target);
    edges.push({ source, target, relation, directed: true });
  }

  return { nodes: [...labels.values()], edges };
}

export interface CooccurrenceExtractionOptions {
  /** Relation label assigned to co-occurrence edges. Defaults to `"co-occurs"`. */
  readonly relation?: string;
}

// Sequences of capitalized, possibly multi-word tokens (Unicode-aware).
const PROPER_NOUN = /\p{Lu}[\p{L}\p{N}]*(?:\s+\p{Lu}[\p{L}\p{N}]*)*/gu;

// Sentence-initial single words that are not entities despite capitalization.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "but", "or", "if", "then", "this", "that", "these",
  "those", "it", "he", "she", "they", "we", "you", "i", "in", "on", "at", "of",
  "to", "for", "as", "is", "are", "was", "were", "his", "her", "their", "our",
]);

function mentionsInSentence(sentence: string): string[] {
  const seen = new Map<string, string>();
  for (const match of sentence.matchAll(PROPER_NOUN)) {
    const surface = match[0].trim();
    if (surface.length === 0) {
      continue;
    }
    const isSingleWord = !surface.includes(" ");
    if (isSingleWord && STOPWORDS.has(surface.toLowerCase())) {
      continue;
    }
    const key = normalizeLabel(surface);
    if (!seen.has(key)) {
      seen.set(key, surface);
    }
  }
  return [...seen.values()];
}

/**
 * Extracts proper-noun entities and links those co-occurring within a sentence
 * via undirected `co-occurs` edges (one per sentence per pair). Repeated
 * co-occurrence across sentences surfaces as duplicate edges, which the ingestor
 * accumulates into edge weight.
 */
export function extractByCooccurrence(
  text: string,
  options: CooccurrenceExtractionOptions = {},
): ExtractionResult {
  const relation = options.relation ?? "co-occurs";
  const labels = new Map<string, ExtractedNode>();
  const edges: ExtractedEdge[] = [];

  for (const sentence of text.split(/[.!?]+/)) {
    const mentions = mentionsInSentence(sentence);
    for (const surface of mentions) {
      const key = normalizeLabel(surface);
      if (!labels.has(key)) {
        labels.set(key, { label: surface, type: "entity" });
      }
    }
    for (let i = 0; i < mentions.length; i += 1) {
      for (let j = i + 1; j < mentions.length; j += 1) {
        const source = mentions[i];
        const target = mentions[j];
        if (source !== undefined && target !== undefined) {
          edges.push({ source, target, relation, directed: false });
        }
      }
    }
  }

  return { nodes: [...labels.values()], edges };
}
