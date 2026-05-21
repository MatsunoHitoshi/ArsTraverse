/**
 * Node Pair Semantic Animation: CDT category → node-pair motion mapping
 *
 * Complements edge-cdt-animation.ts (which drives edge stroke / pictogram)
 * by adding relative motion between the two endpoint nodes of a focused edge.
 *
 * All offsets are in view-space pixels and applied as translate/scale deltas
 * on top of the layout position — the underlying node.x/y are never mutated.
 */

import type { CdtCategory } from "./edge-cdt-animation";
import { CDT_ANIMATION_MAP } from "./edge-cdt-animation";

export const NODE_PAIR_MOTION_MODES = [
  "slideAlong",
  "attract",
  "repel",
  "oscillate",
  "attractStrong",
  "repelStrong",
  "scalePulse",
  "breathe",
] as const;

export type NodePairMotionMode = (typeof NODE_PAIR_MOTION_MODES)[number];

export type NodePairMotionSpec = {
  mode: NodePairMotionMode;
  /** Max displacement in view-space px (scaled by CDT speed at runtime) */
  amplitudePx: number;
  /** When true only the source node moves (e.g. PTRANS directional flow) */
  driveSourceOnly?: boolean;
};

export type NodePairTransform = {
  dx: number;
  dy: number;
  scale: number;
};

export const CDT_NODE_PAIR_MAP: Record<CdtCategory, NodePairMotionSpec> = {
  PTRANS: { mode: "slideAlong", amplitudePx: 8, driveSourceOnly: true },
  ATRANS: { mode: "attract", amplitudePx: 6 },
  PROPEL: { mode: "repel", amplitudePx: 10 },
  MOVE: { mode: "oscillate", amplitudePx: 5 },
  INGEST: { mode: "attractStrong", amplitudePx: 12 },
  EXPEL: { mode: "repelStrong", amplitudePx: 14 },
  SPEAK: { mode: "scalePulse", amplitudePx: 0 },
  MENTAL: { mode: "breathe", amplitudePx: 2 },
};

/**
 * Compute the view-space transform delta for one endpoint of an edge.
 *
 * @param spec      The motion spec for the CDT category
 * @param role      "source" or "target" — which endpoint this node is
 * @param t         Normalized loop progress in [0, 1)
 * @param edgeVec   Unit vector from source → target in view coords: { ux, uy }
 * @returns         { dx, dy, scale } to apply on top of the node's base position
 */
export function computeNodePairOffset(
  spec: NodePairMotionSpec,
  role: "source" | "target",
  t: number,
  edgeVec: { ux: number; uy: number },
): NodePairTransform {
  const { ux, uy } = edgeVec;
  const a = spec.amplitudePx;
  const phase = t * Math.PI * 2;
  // +1 = toward target (along ux), -1 = toward source (against ux)
  const sign = role === "source" ? 1 : -1;

  switch (spec.mode) {
    case "slideAlong": {
      if (spec.driveSourceOnly && role === "target") {
        return { dx: 0, dy: 0, scale: 1 };
      }
      const offset = Math.sin(phase) * a;
      return { dx: ux * offset, dy: uy * offset, scale: 1 };
    }

    case "attract": {
      const pull = (1 - Math.cos(phase)) * 0.5 * a;
      return { dx: sign * ux * pull, dy: sign * uy * pull, scale: 1 };
    }

    case "attractStrong": {
      const pull = (1 - Math.cos(phase)) * 0.5 * a;
      return { dx: sign * ux * pull, dy: sign * uy * pull, scale: 1 };
    }

    case "repel": {
      // Sharp impulse: peaks quickly then decays (abs sine raised to power)
      const impulse = Math.pow(Math.abs(Math.sin(phase)), 3) * a;
      return { dx: -sign * ux * impulse, dy: -sign * uy * impulse, scale: 1 };
    }

    case "repelStrong": {
      const impulse = Math.pow(Math.abs(Math.sin(phase)), 2) * a;
      return { dx: -sign * ux * impulse, dy: -sign * uy * impulse, scale: 1 };
    }

    case "oscillate": {
      // Perpendicular to edge (normal vector)
      const nx = -uy;
      const ny = ux;
      const wave = Math.sin(phase) * a;
      const approach = (1 - Math.cos(phase)) * 0.3 * a;
      return {
        dx: nx * wave + sign * ux * approach,
        dy: ny * wave + sign * uy * approach,
        scale: 1,
      };
    }

    case "scalePulse": {
      const s = 1 + 0.15 * Math.pow(Math.abs(Math.sin(phase)), 2);
      return { dx: 0, dy: 0, scale: s };
    }

    case "breathe": {
      const drift = Math.sin(phase) * a;
      const s = 1 + 0.04 * (1 - Math.cos(phase));
      return { dx: ux * drift * sign * 0.3, dy: uy * drift * sign * 0.3, scale: s };
    }

    default: {
      return { dx: 0, dy: 0, scale: 1 };
    }
  }
}

/** Retrieve the durationMs for a CDT category (from the edge animation map) */
export function getNodePairDurationMs(category: CdtCategory): number {
  return CDT_ANIMATION_MAP[category].durationMs;
}

/** レイアウト座標にペアオフセットを加算（エッジ端点・ラベル位置用） */
export function layoutPosWithNodePair(
  x: number,
  y: number,
  pair: NodePairTransform | null,
  viewScale = 1,
): { x: number; y: number } {
  return {
    x: x + (pair?.dx ?? 0) * viewScale,
    y: y + (pair?.dy ?? 0) * viewScale,
  };
}
