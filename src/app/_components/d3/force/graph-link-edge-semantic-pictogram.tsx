"use client";

import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";
import { EdgeSemanticPictogram } from "./storytelling-graph/components/edge-semantic-pictogram";

export type GraphLinkEdgeSemanticPictogramProps = {
  graphLink: CustomLinkType;
  getEdgeMotionConfig: (edgeId: string) => EdgeMotionConfig | null;
  displayScale: number;
};

/**
 * D3ForceGraph のリンク map 内から呼び出す、エッジ中点の CDT ピクトグラム。
 * map 内の IIFE を避け、可読性のために切り出している。
 */
export function GraphLinkEdgeSemanticPictogram({
  graphLink,
  getEdgeMotionConfig,
  displayScale,
}: GraphLinkEdgeSemanticPictogramProps) {
  const motionConfig = getEdgeMotionConfig(graphLink.id);
  if (!motionConfig) return null;

  const modSource = graphLink.source as CustomNodeType;
  const modTarget = graphLink.target as CustomNodeType;
  const midX = ((modSource.x ?? 0) + (modTarget.x ?? 0)) / 2;
  const midY = ((modSource.y ?? 0) + (modTarget.y ?? 0)) / 2;

  return (
    <EdgeSemanticPictogram
      config={motionConfig}
      cx={midX}
      cy={midY}
      displayScale={displayScale}
    />
  );
}
