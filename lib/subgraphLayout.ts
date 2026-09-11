/**
 * Deterministic subgraph layout.
 *
 * A dependency-free Fruchterman-Reingold force layout plus node sizing, factored
 * out of the SVG component so the geometry is a pure, testable function: positions
 * are determined solely by node/edge identity (circular seeding, fixed iteration
 * count, no randomness), so the same subgraph always lays out identically.
 */

import type { GraphEdge, GraphNode, NodeId } from "@core/types";

/** Logical drawing surface; the SVG scales responsively to its container. */
export const WIDTH = 520;
export const HEIGHT = 380;
export const MARGIN = 52;

export interface Point {
  x: number;
  y: number;
}

interface LinkIndex {
  readonly s: number;
  readonly t: number;
}

/**
 * Computes node positions keyed by node id. Deterministic: initial positions sit
 * on a circle by index, then relax over a fixed number of iterations, and the
 * result is scaled to fit the inner drawing rectangle.
 */
export function computeLayout(
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

/** Maps a node's relevance score to a radius in `[7, 14]`. */
export function radiusFor(
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
