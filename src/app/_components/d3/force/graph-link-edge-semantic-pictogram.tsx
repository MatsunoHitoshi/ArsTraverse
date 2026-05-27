"use client";

import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";
import {
  layoutPosWithNodePair,
  nodePairOffsetLayoutScale,
  type NodePairTransform,
} from "@/app/const/edge-cdt-node-pair-animation";
import { EdgeSemanticMotionScene } from "./storytelling-graph/components/edge-semantic-pictogram";

export type GraphLinkEdgeSemanticPictogramProps = {
  graphLink: CustomLinkType;
  getEdgeMotionConfig: (edgeId: string) => EdgeMotionConfig | null;
  displayScale: number;
  getNodePairTransform?: (nodeId: string) => NodePairTransform | null;
};

/**
 * D3ForceGraph のリンク map 内から呼び出す、ノードペア全体の CDT モーション scene。
 * map 内の IIFE を避け、可読性のために切り出している。
 */
export function GraphLinkEdgeSemanticPictogram({
  graphLink,
  getEdgeMotionConfig,
  displayScale,
  getNodePairTransform,
}: GraphLinkEdgeSemanticPictogramProps) {
  const motionConfig = getEdgeMotionConfig(graphLink.id);
  if (!motionConfig) return null;

  const modSource = graphLink.source as CustomNodeType;
  const modTarget = graphLink.target as CustomNodeType;
  if (
    modSource.x == null ||
    modSource.y == null ||
    modTarget.x == null ||
    modTarget.y == null
  ) {
    return null;
  }

  const pairLayoutScale = nodePairOffsetLayoutScale(displayScale);
  const src = layoutPosWithNodePair(
    modSource.x,
    modSource.y,
    getNodePairTransform?.(modSource.id) ?? null,
    pairLayoutScale,
  );
  const tgt = layoutPosWithNodePair(
    modTarget.x,
    modTarget.y,
    getNodePairTransform?.(modTarget.id) ?? null,
    pairLayoutScale,
  );
  return (
    <EdgeSemanticMotionScene
      config={motionConfig}
      sourceX={src.x}
      sourceY={src.y}
      targetX={tgt.x}
      targetY={tgt.y}
      displayScale={displayScale}
    />
  );
}
