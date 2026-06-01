/**
 * Graph-RAG context assembler.
 *
 * Serializes a retrieved {@link SubgraphResult} into a compact, deterministic
 * text block bounded by a token budget, ready to prepend to a generation prompt.
 * Nodes are admitted in descending relevance until the budget is exhausted;
 * relations are included only between admitted nodes.
 *
 * Token accounting is delegated to an injectable {@link TokenEstimator}. The
 * default is a cheap character heuristic so the assembler carries no dependency
 * on a tokenizer; callers may pass the model's true encoder for exact budgeting.
 */

import type {
  GraphEdge,
  GraphNode,
  NodeId,
  PropertyBag,
  SubgraphResult,
} from "../types/graph.js";

/** Maps text to an estimated token count. */
export type TokenEstimator = (text: string) => number;

/**
 * Character-based heuristic (~4 characters per token for English). Adequate for
 * budgeting when an exact tokenizer is unavailable.
 */
export const estimateTokensByChars: TokenEstimator = (text) =>
  Math.ceil(text.length / 4);

export interface ContextAssemblyOptions {
  /** Maximum tokens the assembled block may occupy, per the estimator. */
  readonly tokenBudget: number;
  /** Token estimator; defaults to {@link estimateTokensByChars}. */
  readonly estimateTokens?: TokenEstimator;
  /** Optional framing line emitted before the entities. */
  readonly header?: string;
  /** Whether to emit relation lines. Defaults to `true`. */
  readonly includeEdges?: boolean;
}

export interface AssembledContext {
  /** The serialized context block. */
  readonly text: string;
  /** Node ids admitted within the budget, in emission order. */
  readonly includedNodes: ReadonlyArray<NodeId>;
  /** Estimated token count of {@link text} under the active estimator. */
  readonly tokenCount: number;
  /** True if any node or relation was dropped to satisfy the budget. */
  readonly truncated: boolean;
}

function renderProperties(properties: PropertyBag): string {
  const keys = Object.keys(properties).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    const value = properties[key];
    if (value !== undefined) {
      pairs.push(`${key}=${String(value)}`);
    }
  }
  return pairs.length === 0 ? "" : ` {${pairs.join(", ")}}`;
}

function renderNode(node: GraphNode): string {
  return `- ${node.label} [${node.type}]${renderProperties(node.properties)}`;
}

function renderEdge(edge: GraphEdge, labelOf: (id: NodeId) => string): string {
  const connector = edge.directed
    ? `-[${edge.relation}]->`
    : `-[${edge.relation}]-`;
  return `- ${labelOf(edge.source)} ${connector} ${labelOf(edge.target)}`;
}

/**
 * Assembles a token-bounded context block from a retrieved subgraph. Nodes are
 * ranked by their relevance score (descending; missing scores rank last) and
 * admitted greedily; because admission is score-ordered, the first node that
 * overflows the budget terminates node packing. Relations are then packed while
 * budget remains, skipping any whose endpoints were not admitted.
 */
export function assembleContext(
  subgraph: SubgraphResult,
  options: ContextAssemblyOptions,
): AssembledContext {
  const estimate = options.estimateTokens ?? estimateTokensByChars;
  const includeEdges = options.includeEdges ?? true;
  const budget = options.tokenBudget;

  let text = "";
  let truncated = false;

  /** Appends a line if doing so keeps the block within budget. */
  const tryAppend = (line: string): boolean => {
    const candidate = text.length === 0 ? line : `${text}\n${line}`;
    if (estimate(candidate) > budget) {
      return false;
    }
    text = candidate;
    return true;
  };

  if (options.header !== undefined && options.header.length > 0) {
    if (!tryAppend(options.header)) {
      // The framing line is retained even when it alone exceeds the budget.
      text = options.header;
      truncated = true;
    }
  }

  const ranked = [...subgraph.nodes].sort(
    (a, b) =>
      (subgraph.scores.get(b.id) ?? 0) - (subgraph.scores.get(a.id) ?? 0),
  );

  const included = new Set<NodeId>();
  const labelById = new Map<NodeId, string>();
  for (const node of ranked) {
    if (!tryAppend(renderNode(node))) {
      truncated = true;
      break;
    }
    included.add(node.id);
    labelById.set(node.id, node.label);
  }

  if (includeEdges) {
    const labelOf = (id: NodeId): string => labelById.get(id) ?? String(id);
    for (const edge of subgraph.edges) {
      if (!included.has(edge.source) || !included.has(edge.target)) {
        continue;
      }
      if (!tryAppend(renderEdge(edge, labelOf))) {
        truncated = true;
      }
    }
  }

  return {
    text,
    includedNodes: [...included],
    tokenCount: estimate(text),
    truncated,
  };
}
