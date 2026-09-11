"use client";

/**
 * Visual rendering of a retrieved subgraph.
 *
 * Computes a deterministic force-directed layout (no external dependency, no
 * randomness — positions are a pure function of node/edge identity) and draws
 * it as an SVG: directed/undirected relations with labels, nodes sized by
 * relevance score, seed anchors highlighted, and neighborhood highlight on hover.
 */

import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import type { GraphEdge, GraphNode, NodeId, SubgraphResult } from "@core/types";

/** Logical drawing surface; the SVG scales responsively to its container. */
const WIDTH = 520;
const HEIGHT = 380;
const MARGIN = 52;

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

interface Point {
  x: number;
  y: number;
}

interface LinkIndex {
  readonly s: number;
  readonly t: number;
}

/**
 * Fruchterman-Reingold layout. Seeded deterministically by node index (initial
 * positions on a circle), then relaxed for a fixed number of iterations, so the
 * same subgraph always lays out identically. Returns positions keyed by node id.
 */
function computeLayout(
  nodes: ReadonlyArray<GraphNode>,
  edges: ReadonlyArray<GraphEdge>,
): Map<NodeId, Point> {
  const count = nodes.length;
  const result = new Map<NodeId, Point>();
  if (count === 0) {
    return result;
  }

  const innerW = WIDTH - 2 * MARGIN;
  const innerH = HEIGHT - 2 * MARGIN;
  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2;

  // Deterministic initial placement on a circle.
  const initRadius = Math.min(innerW, innerH) * 0.42;
  const pos: Point[] = nodes.map((_node, index) => {
    const angle = (2 * Math.PI * index) / count;
    return {
      x: centerX + initRadius * Math.cos(angle),
      y: centerY + initRadius * Math.sin(angle),
    };
  });

  if (count === 1) {
    const only = nodes[0];
    if (only !== undefined) {
      result.set(only.id, { x: centerX, y: centerY });
    }
    return result;
  }

  // Resolve edge endpoints to node indices once; drop dangling references.
  const indexById = new Map<NodeId, number>();
  nodes.forEach((node, index) => indexById.set(node.id, index));
  const links: LinkIndex[] = [];
  for (const edge of edges) {
    const s = indexById.get(edge.source);
    const t = indexById.get(edge.target);
    if (s !== undefined && t !== undefined && s !== t) {
      links.push({ s, t });
    }
  }

  const area = innerW * innerH;
  const k = 0.8 * Math.sqrt(area / count); // ideal edge length
  const iterations = 320;
  let temperature = innerW * 0.12;
  const cooling = temperature / (iterations + 1);
  const EPS = 0.01;

  for (let step = 0; step < iterations; step += 1) {
    const disp: Point[] = nodes.map(() => ({ x: 0, y: 0 }));

    // Repulsion between every pair.
    for (let i = 0; i < count; i += 1) {
      const pa = pos[i];
      const da = disp[i];
      if (pa === undefined || da === undefined) continue;
      for (let j = i + 1; j < count; j += 1) {
        const pb = pos[j];
        const db = disp[j];
        if (pb === undefined || db === undefined) continue;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let dist = Math.hypot(dx, dy);
        if (dist < EPS) {
          // Deterministic nudge to separate coincident points.
          dx = (i - j) * EPS;
          dy = EPS;
          dist = Math.hypot(dx, dy);
        }
        const force = (k * k) / dist;
        const ux = dx / dist;
        const uy = dy / dist;
        da.x += ux * force;
        da.y += uy * force;
        db.x -= ux * force;
        db.y -= uy * force;
      }
    }

    // Attraction along links.
    for (const link of links) {
      const pa = pos[link.s];
      const pb = pos[link.t];
      const da = disp[link.s];
      const db = disp[link.t];
      if (pa === undefined || pb === undefined || da === undefined || db === undefined) continue;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const dist = Math.max(Math.hypot(dx, dy), EPS);
      const force = (dist * dist) / k;
      const ux = dx / dist;
      const uy = dy / dist;
      da.x -= ux * force;
      da.y -= uy * force;
      db.x += ux * force;
      db.y += uy * force;
    }

    // Apply displacement, capped by the current temperature.
    for (let i = 0; i < count; i += 1) {
      const d = disp[i];
      const p = pos[i];
      if (d === undefined || p === undefined) continue;
      const len = Math.max(Math.hypot(d.x, d.y), EPS);
      p.x += (d.x / len) * Math.min(len, temperature);
      p.y += (d.y / len) * Math.min(len, temperature);
    }

    temperature = Math.max(temperature - cooling, 0);
  }

  // Fit the laid-out cloud into the inner drawing rectangle.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const offsetX = (WIDTH - spanX * scale) / 2;
  const offsetY = (HEIGHT - spanY * scale) / 2;

  nodes.forEach((node, index) => {
    const p = pos[index];
    if (p === undefined) return;
    result.set(node.id, {
      x: offsetX + (p.x - minX) * scale,
      y: offsetY + (p.y - minY) * scale,
    });
  });
  return result;
}

/** Maps a node's relevance score to a radius. */
function radiusFor(
  id: NodeId,
  scores: ReadonlyMap<NodeId, number>,
  bounds: { readonly min: number; readonly max: number },
): number {
  const score = scores.get(id);
  if (score === undefined || bounds.max === bounds.min) {
    return 8;
  }
  const t = (score - bounds.min) / (bounds.max - bounds.min);
  return 7 + t * 7;
}

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
