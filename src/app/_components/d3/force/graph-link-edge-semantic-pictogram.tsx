"use client";

import { useMemo } from "react";
import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";
import type { SkeletonMotionData, SkeletonViewCamera } from "@/app/const/skeleton-motion";
import {
  layoutPosWithNodePair,
  nodePairOffsetLayoutScale,
  type NodePairTransform,
} from "@/app/const/edge-cdt-node-pair-animation";
import { calcSkeletonAnchorAboveEdgeLabel } from "./storytelling-graph/utils/graph-utils";
import { analyzeSkeletonFootTravel } from "@/app/_utils/kg/skeleton-foot-travel";
import { EdgeSemanticMotionScene } from "./storytelling-graph/components/edge-semantic-pictogram";
import { SkeletonMotionRenderer } from "./storytelling-graph/components/skeleton-motion-renderer";

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

/**
 * T2Mモデル（MoMask/OmniControl）による骨格モーションをエッジ上に描画する。
 * GraphLinkEdgeSemanticPictogram の骨格モーション版。
 */
export function GraphLinkSkeletonMotion({
  graphLink,
  getSkeletonMotion,
  motionData: motionDataProp,
  displayScale,
  getNodePairTransform,
  positionT = 0,
  anchorAtEdgeLabel = false,
  footTravelFromFeet = true,
  skeletonAboveLabelExtraY = 0,
  hasExplicitEdges = true,
  isFocusEdge = true,
  playbackProgress,
  loopCrossfade,
  opacity,
  facesLeft: facesLeftOverride,
  viewCamera,
}: {
  graphLink: CustomLinkType;
  getSkeletonMotion?: (edgeId: string) => SkeletonMotionData | null;
  motionData?: SkeletonMotionData | null;
  displayScale: number;
  getNodePairTransform?: (nodeId: string) => NodePairTransform | null;
  /** 0 = source side, 0.5 = midpoint, 1 = target side */
  positionT?: number;
  /** Anchor at edge label + normal offset (overrides positionT). */
  anchorAtEdgeLabel?: boolean;
  /** When true, advance from source using foot-activity profile (max midpoint). */
  footTravelFromFeet?: boolean;
  /** Extra lift along edge normal when anchorAtEdgeLabel (SVG pixels). */
  skeletonAboveLabelExtraY?: number;
  /** Matches storytelling graph label side selection. */
  hasExplicitEdges?: boolean;
  isFocusEdge?: boolean;
  playbackProgress?: number;
  loopCrossfade?: boolean;
  opacity?: number;
  facesLeft?: boolean;
  viewCamera?: SkeletonViewCamera | null;
}) {
  const motionData =
    motionDataProp ?? getSkeletonMotion?.(graphLink.id) ?? null;

  const footTravelProfile = useMemo(
    () =>
      footTravelFromFeet && motionData
        ? analyzeSkeletonFootTravel(motionData)
        : null,
    [footTravelFromFeet, motionData],
  );

  const t = useMemo(() => {
    if (anchorAtEdgeLabel) return Math.max(0, Math.min(1, positionT));
    if (footTravelProfile) {
      if (playbackProgress !== undefined) {
        return footTravelProfile.positionTAtProgress(playbackProgress);
      }
      return 0;
    }
    return Math.max(0, Math.min(1, positionT));
  }, [
    anchorAtEdgeLabel,
    footTravelProfile,
    playbackProgress,
    positionT,
  ]);

  if (!motionData) return null;

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

  let posX: number;
  let posY: number;
  if (anchorAtEdgeLabel) {
    const anchor = calcSkeletonAnchorAboveEdgeLabel(
      src.x,
      src.y,
      tgt.x,
      tgt.y,
      skeletonAboveLabelExtraY,
      hasExplicitEdges,
      isFocusEdge,
    );
    posX = anchor.x;
    posY = anchor.y;
  } else {
    posX = src.x + (tgt.x - src.x) * t;
    posY = src.y + (tgt.y - src.y) * t;
  }
  const facesLeft =
    viewCamera?.alignWithEdge ? false : (facesLeftOverride ?? tgt.x < src.x);

  return (
    <SkeletonMotionRenderer
      motionData={motionData}
      globalX={posX}
      globalY={posY}
      displayScale={displayScale}
      facesLeft={facesLeft}
      viewCamera={viewCamera}
      opacity={opacity}
      playbackProgress={playbackProgress}
      loopCrossfade={loopCrossfade}
    />
  );
}
