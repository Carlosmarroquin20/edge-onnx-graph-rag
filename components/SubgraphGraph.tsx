"use client";

/**
 * Visual rendering of a retrieved subgraph.
 *
 * Draws the graph as inline SVG using the deterministic layout from
 * `lib/subgraphLayout` (a pure function of node/edge identity): directed vs.
 * undirected relations with labels, nodes sized by relevance score, seed anchors
 * highlighted, and neighborhood highlight on hover.
 */

import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import type { GraphEdge, NodeId, SubgraphResult } from "@core/types";
import { WIDTH, HEIGHT, computeLayout, radiusFor } from "../lib/subgraphLayout.js";

const PALETTE = {
  halo: "#0a0a0a",
  edge: "#5b5b5b",
  edgeActive: "#34d399",
  relation: "#a3a3a3",
  nodeFill: "#262626",
  nodeStroke: "#525252",
  seedFill: "rgba(16,185,129,0.18)",
  seedStroke: "#34d399",
  label: "#e5e5e5",
} as const;

export function SubgraphGraph({
  subgraph,
  seedIds,
}: {
  readonly subgraph: SubgraphResult;
  readonly seedIds: ReadonlyArray<NodeId>;
}): ReactElement | null {
  const { nodes, edges, scores } = subgraph;
  const [hovered, setHovered] = useState<NodeId | null>(null);

  const layout = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);
  const labelById = useMemo(() => {
    const m = new Map<NodeId, string>();
    for (const n of nodes) m.set(n.id, n.label);
    return m;
  }, [nodes]);
  const scoreBounds = useMemo(() => {
    const values = [...scores.values()];
    return { min: Math.min(0, ...values), max: Math.max(0, ...values) };
  }, [scores]);

  if (nodes.length === 0) {
    return null;
  }

  const seedSet = new Set(seedIds);
  const present = new Set(nodes.map((n) => n.id));
  const links = edges.filter((e) => present.has(e.source) && present.has(e.target));

  // Neighborhood of the hovered node (for dimming the rest).
  const neighbors = new Set<NodeId>();
  if (hovered !== null) {
    neighbors.add(hovered);
    for (const e of links) {
      if (e.source === hovered) neighbors.add(e.target);
      if (e.target === hovered) neighbors.add(e.source);
    }
  }
  const isActiveNode = (id: NodeId): boolean => hovered === null || neighbors.has(id);
  const isActiveEdge = (e: GraphEdge): boolean =>
    hovered === null || e.source === hovered || e.target === hovered;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Retrieved subgraph: ${nodes.length} nodes and ${links.length} relations${
          seedIds.length > 0 ? `, anchored at ${seedIds.length} seed nodes` : ""
        }.`}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <marker
            id="sg-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={PALETTE.edge} />
          </marker>
          <marker
            id="sg-arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={PALETTE.edgeActive} />
          </marker>
        </defs>

        {/* Edges */}
        <g>
          {links.map((edge) => {
            const a = layout.get(edge.source);
            const b = layout.get(edge.target);
            if (a === undefined || b === undefined) {
              return null;
            }
            const active = isActiveEdge(edge);
            // Shorten the segment so the arrowhead meets the node rim, not center.
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.max(Math.hypot(dx, dy), 1);
            const tr = radiusFor(edge.target, scores, scoreBounds) + 4;
            const sr = radiusFor(edge.source, scores, scoreBounds) + 2;
            const x1 = a.x + (dx / dist) * sr;
            const y1 = a.y + (dy / dist) * sr;
            const x2 = b.x - (dx / dist) * tr;
            const y2 = b.y - (dy / dist) * tr;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const emphasize = active && hovered !== null;
            return (
              <g key={edge.id} opacity={active ? 1 : 0.12}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={active ? PALETTE.edgeActive : PALETTE.edge}
                  strokeWidth={emphasize ? 1.75 : 1.15}
                  markerEnd={
                    edge.directed
                      ? `url(#${emphasize ? "sg-arrow-active" : "sg-arrow"})`
                      : undefined
                  }
                />
                <text
                  x={mx}
                  y={my}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fill={PALETTE.relation}
                  stroke={PALETTE.halo}
                  strokeWidth={3}
                  paintOrder="stroke"
                  style={{ pointerEvents: "none" }}
                >
                  {edge.relation}
                </text>
              </g>
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {nodes.map((node) => {
            const p = layout.get(node.id);
            if (p === undefined) {
              return null;
            }
            const r = radiusFor(node.id, scores, scoreBounds);
            const seed = seedSet.has(node.id);
            const active = isActiveNode(node.id);
            const label = labelById.get(node.id) ?? node.id;
            const score = scores.get(node.id);
            return (
              <g
                key={node.id}
                opacity={active ? 1 : 0.22}
                onMouseEnter={() => setHovered(node.id)}
                style={{ cursor: "pointer" }}
              >
                <title>
                  {label} · {node.type}
                  {score !== undefined ? ` · score ${score.toFixed(2)}` : ""}
                </title>
                {seed && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 4}
                    fill="none"
                    stroke={PALETTE.seedStroke}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={seed ? PALETTE.seedFill : PALETTE.nodeFill}
                  stroke={seed ? PALETTE.seedStroke : PALETTE.nodeStroke}
                  strokeWidth={seed ? 1.75 : 1.25}
                />
                <text
                  x={p.x}
                  y={p.y + r + 11}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill={seed ? PALETTE.seedStroke : PALETTE.label}
                  stroke={PALETTE.halo}
                  strokeWidth={3}
                  paintOrder="stroke"
                  style={{ pointerEvents: "none", fontWeight: seed ? 600 : 400 }}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
