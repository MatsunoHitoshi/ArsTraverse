"use client";

import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";
import {
  layoutPosWithNodePair,
  nodePairOffsetLayoutScale,
  type NodePairTransform,
} from "@/app/const/edge-cdt-node-pair-animation";
import { EdgeSemanticPictogram } from "./storytelling-graph/components/edge-semantic-pictogram";

export type GraphLinkEdgeSemanticPictogramProps = {
  graphLink: CustomLinkType;
  getEdgeMotionConfig: (edgeId: string) => EdgeMotionConfig | null;
  displayScale: number;
  getNodePairTransform?: (nodeId: string) => NodePairTransform | null;
};

/**
 * D3ForceGraph のリンク map 内から呼び出す、エッジ中点の CDT ピクトグラム。
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
  const pairLayoutScale = nodePairOffsetLayoutScale(displayScale);
  const src = layoutPosWithNodePair(
    modSource.x ?? 0,
    modSource.y ?? 0,
    getNodePairTransform?.(modSource.id) ?? null,
    pairLayoutScale,
  );
  const tgt = layoutPosWithNodePair(
    modTarget.x ?? 0,
    modTarget.y ?? 0,
    getNodePairTransform?.(modTarget.id) ?? null,
    pairLayoutScale,
  );
  const midX = (src.x + tgt.x) / 2;
  const midY = (src.y + tgt.y) / 2;

  return (
    <EdgeSemanticPictogram
      config={motionConfig}
      cx={midX}
      cy={midY}
      displayScale={displayScale}
    />
  );
}
