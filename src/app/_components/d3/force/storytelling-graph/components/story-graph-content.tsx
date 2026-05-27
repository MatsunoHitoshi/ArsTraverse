import type React from "react";
import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import { getEdgeCompositeKeyFromLink } from "@/app/const/story-segment";
import { getMaxEdgeLabelFontSizeByLength } from "@/app/_utils/graph-label-utils";
import { calcEdgeLabelPos, getDirectionalKey } from "../utils/graph-utils";
import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";
import {
  layoutPosWithNodePair,
  nodePairOffsetLayoutScale,
  type NodePairTransform,
} from "@/app/const/edge-cdt-node-pair-animation";
import {
  CdtAnimatedEdgePath,
  CdtEdgeGlowFilterDef,
} from "./cdt-animated-edge-path";
import { EdgeSemanticMotionScene } from "./edge-semantic-pictogram";

const MIN_DISPLAY_NODE_RADIUS = 3;

type CommunityDisplay = {
  communityId: string;
  title?: string;
  centerX: number;
  centerY: number;
  radius: number;
};

export function StoryGraphContent(props: {
  /** DOM 直接操作用: StoryGraphContent 最上位 <g> に attach する ref */
  graphContentRef?: React.RefObject<SVGGElement>;
  shouldRunSteadyAnim: boolean;
  edgeFlowStops: Array<{ offset: string; opacity: number }> | null;
  pathItemsWithFocusIndex: Array<{
    link: CustomLinkType;
    hasFocus: boolean;
    focusGradientIndex: number;
  }>;
  toView: (x: number, y: number) => readonly [number, number];
  showFullGraph: boolean;
  communityDisplayData: CommunityDisplay[];
  displayScale: number;
  onCommunityTitleClick?: (communityId: string) => void;
  hasExplicitEdges: boolean;
  segmentBranch: boolean;
  /**
   * エッジ線描画の進行度（0–1）。
   * カメラ遷移中は 0、post-focus フェーズまたは segmentProgress から算出した値を受け取る。
   * 内部で `freeExploreMode ? 1` や `showFullGraph ? overviewEdgeProgress` に分岐する。
   */
  edgeRevealProgress: number;
  freeExploreMode: boolean;
  overviewEdgeProgress: number;
  linkDistanceRange: { minDistance: number; distanceRange: number };
  segmentProgress?: number;
  isPc: boolean;
  edgeStrokeWidthFocus: number;
  edgeStrokeWidthNormal: number;
  neighborNodeIdSet: Set<string>;
  edgeOpacities: {
    focus: number;
    neighbor: number;
    dim: number;
    exploreNeighbor: number;
    exploreDim: number;
  };
  linksByNodePair: Map<string, CustomLinkType[]>;
  focusEdgeIdSet: Set<string>;
  showEdgeLabels: boolean;
  expandedEdgePairKey: string | null;
  setExpandedEdgePairKey: React.Dispatch<React.SetStateAction<string | null>>;
  getEdgeLabelFontSize: (isFocusEdge: boolean) => number;
  visibleNodesToRender: CustomNodeType[];
  focusNodeIdSet: Set<string>;
  getNodeOpacity: (node: CustomNodeType) => number;
  getNodeRadius: (node: CustomNodeType) => number;
  scaleForSize: number;
  nodePulseScale: number;
  failedImageNodeIds: Set<string>;
  setFailedImageNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  nodeStrokeWidth: number;
  getNodeLabelFontSize: (isFocusNode: boolean) => number;
  effectiveScaleForLabels: number;
  draggingNodeId: string | null;
  /** CDT分類済みエッジのアニメーション設定を取得する関数。null なら標準描画 */
  getEdgeMotionConfig?: (edgeId: string) => EdgeMotionConfig | null;
  /** 指定時はこの CDT エッジ群だけをフルアニメーションし、他の CDT エッジは静止表示 */
  activeSemanticEdgeIds?: Set<string> | null;
  /** CDTカテゴリに基づくノードペアのビュー空間オフセット+スケール */
  getNodePairTransform?: (nodeId: string) => NodePairTransform | null;
}) {
  const {
    graphContentRef,
    shouldRunSteadyAnim,
    edgeFlowStops,
    pathItemsWithFocusIndex,
    toView,
    showFullGraph,
    communityDisplayData,
    displayScale,
    onCommunityTitleClick,
    hasExplicitEdges,
    segmentBranch,
    edgeRevealProgress,
    freeExploreMode,
    overviewEdgeProgress,
    linkDistanceRange,
    segmentProgress,
    isPc,
    edgeStrokeWidthFocus,
    edgeStrokeWidthNormal,
    neighborNodeIdSet,
    edgeOpacities,
    linksByNodePair,
    focusEdgeIdSet,
    showEdgeLabels,
    expandedEdgePairKey,
    setExpandedEdgePairKey,
    getEdgeLabelFontSize,
    visibleNodesToRender,
    focusNodeIdSet,
    getNodeOpacity,
    getNodeRadius,
    scaleForSize,
    nodePulseScale,
    failedImageNodeIds,
    setFailedImageNodeIds,
    nodeStrokeWidth,
    getNodeLabelFontSize,
    effectiveScaleForLabels,
    draggingNodeId,
    getEdgeMotionConfig,
    activeSemanticEdgeIds,
    getNodePairTransform,
  } = props;

  const hasCdtEdges = pathItemsWithFocusIndex.some(
    (item) => item.hasFocus && getEdgeMotionConfig?.(item.link.id),
  );

  /** レイアウト座標にペアオフセットを加えてからビュー座標へ（エッジ端点・ノード・ラベルで共通） */
  const pairLayoutScale = nodePairOffsetLayoutScale(displayScale);
  const nodeViewWithPair = (node: CustomNodeType): [number, number] => {
    const pair = getNodePairTransform?.(node.id) ?? null;
    const layout = layoutPosWithNodePair(
      node.x ?? 0,
      node.y ?? 0,
      pair,
      pairLayoutScale,
    );
    const [vx, vy] = toView(layout.x, layout.y);
    return [vx, vy];
  };

  return (
    <g ref={graphContentRef}>
      {hasCdtEdges && (
        <defs>
          <CdtEdgeGlowFilterDef />
        </defs>
      )}
      {shouldRunSteadyAnim && edgeFlowStops && (
        <defs>
          {pathItemsWithFocusIndex
            .filter((item) => item.hasFocus)
            .map((item, i) => {
              const link = item.link;
              const src = link.source as CustomNodeType;
              const tgt = link.target as CustomNodeType;
              if (
                !src ||
                !tgt ||
                src.x == null ||
                src.y == null ||
                tgt.x == null ||
                tgt.y == null
              )
                return null;
              const [gsx, gsy] = nodeViewWithPair(src);
              const [gtx, gty] = nodeViewWithPair(tgt);
              return (
                <linearGradient
                  key={`edge-flow-${i}`}
                  id={`edge-flow-${i}`}
                  gradientUnits="userSpaceOnUse"
                  x1={gsx}
                  y1={gsy}
                  x2={gtx}
                  y2={gty}
                >
                  {edgeFlowStops.map((stop, j) => (
                    <stop
                      key={j}
                      offset={stop.offset}
                      stopColor="#94a3b8"
                      stopOpacity={stop.opacity}
                    />
                  ))}
                </linearGradient>
              );
            })}
        </defs>
      )}

      {showFullGraph && communityDisplayData.length > 0 && (
        <>
          <defs>
            {communityDisplayData.map((comm) => {
              const gradientId = `storytelling-community-gradient-${comm.communityId}`;
              return (
                <radialGradient
                  key={gradientId}
                  id={gradientId}
                  cx="50%"
                  cy="50%"
                  r="50%"
                >
                  <stop offset="0%" stopColor="#004df7" stopOpacity="0.25" />
                  <stop offset="50%" stopColor="#004df7" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#004df7" stopOpacity="0" />
                </radialGradient>
              );
            })}
          </defs>
          {communityDisplayData.map((comm) => {
            const [vx, vy] = toView(comm.centerX, comm.centerY);
            const viewRadius = comm.radius * displayScale;
            const gradientId = `storytelling-community-gradient-${comm.communityId}`;
            return (
              <g key={comm.communityId}>
                <circle
                  cx={vx}
                  cy={vy}
                  r={viewRadius}
                  fill={`url(#${gradientId})`}
                  stroke="#334155"
                  strokeWidth={1}
                  strokeOpacity={0.4}
                  className="pointer-events-none"
                />
                {comm.title != null && comm.title !== "" && (
                  <text
                    x={vx}
                    y={vy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#e2e8f0"
                    fontSize={Math.max(10, Math.min(14, viewRadius / 4))}
                    fontWeight="600"
                    className="cursor-pointer select-none hover:fill-slate-100"
                    style={{ pointerEvents: "all" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCommunityTitleClick?.(comm.communityId);
                    }}
                  >
                    {comm.title}
                  </text>
                )}
              </g>
            );
          })}
        </>
      )}

      {/* 1. エッジパスをすべて先に描画（同一方向は1本に集約） */}
      {pathItemsWithFocusIndex.map((item, i) => {
        const link = item.link;
        const source = link.source as CustomNodeType;
        const target = link.target as CustomNodeType;
        if (
          !source ||
          !target ||
          source.x == null ||
          source.y == null ||
          target.x == null ||
          target.y == null
        )
          return null;
        const [sx, sy] = nodeViewWithPair(source);
        const [tx, ty] = nodeViewWithPair(target);
        const dirKey = getDirectionalKey(link);
        const pathD = `M ${sx} ${sy} L ${tx} ${ty}`;
        const isFocusEdge = item.hasFocus;
        /** freeExploreMode では常に全線表示。showFullGraph 時は専用の overview progress を使用 */
        const effectiveEdgeProgress = freeExploreMode
          ? 1
          : showFullGraph && isFocusEdge
            ? overviewEdgeProgress
            : edgeRevealProgress;

        if (hasExplicitEdges && isFocusEdge) {
          const focusStrokeOpacity = freeExploreMode
            ? edgeOpacities.focus
            : showFullGraph
              ? (() => {
                  const layoutDx = target.x - source.x;
                  const layoutDy = target.y - source.y;
                  const distance = Math.sqrt(
                    layoutDx * layoutDx + layoutDy * layoutDy,
                  );
                  const normalizedDistance =
                    linkDistanceRange.distanceRange > 0
                      ? (distance - linkDistanceRange.minDistance) /
                        linkDistanceRange.distanceRange
                      : 0;
                  return 0.6 - normalizedDistance * 0.59;
                })()
              : edgeOpacities.focus;
          const useFlowGrad =
            shouldRunSteadyAnim &&
            edgeFlowStops != null &&
            (!segmentBranch || (segmentProgress ?? 1) >= 1) &&
            !getEdgeMotionConfig?.(link.id);

          const motionConfig = getEdgeMotionConfig?.(link.id) ?? null;
          const edgeFullyRevealed = effectiveEdgeProgress >= 1;
          const isSequencedCdtEdge =
            motionConfig != null && activeSemanticEdgeIds != null;
          const isActiveCdtEdge =
            !isSequencedCdtEdge || activeSemanticEdgeIds.has(link.id);
          const cdtStrokeOpacity =
            motionConfig != null && !isActiveCdtEdge
              ? Math.max(0.18, focusStrokeOpacity * 0.35)
              : focusStrokeOpacity;
          const steadyCdtAnim =
            motionConfig != null &&
            isActiveCdtEdge &&
            (useFlowGrad || edgeFullyRevealed || freeExploreMode);

          return (
            <g key={`path-${dirKey}-${i}`}>
              {motionConfig ? (
                <CdtAnimatedEdgePath
                  pathD={pathD}
                  motionConfig={motionConfig}
                  strokeWidth={
                    isActiveCdtEdge
                      ? edgeStrokeWidthFocus
                      : edgeStrokeWidthFocus * 0.85
                  }
                  strokeOpacity={cdtStrokeOpacity}
                  revealProgress={
                    edgeFullyRevealed ? undefined : effectiveEdgeProgress
                  }
                  steadyAnimate={steadyCdtAnim}
                />
              ) : useFlowGrad ? (
                <path
                  data-edge-key={dirKey}
                  d={pathD}
                  fill="none"
                  stroke={`url(#edge-flow-${item.focusGradientIndex})`}
                  strokeLinecap="round"
                  strokeWidth={edgeStrokeWidthFocus}
                />
              ) : (
                <path
                  data-edge-key={dirKey}
                  d={pathD}
                  fill="none"
                  stroke="#94a3b8"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - effectiveEdgeProgress}
                  style={
                    segmentProgress != null
                      ? undefined
                      : !isPc
                        ? { transition: "stroke-dashoffset 100ms ease-out" }
                        : undefined
                  }
                  strokeLinecap="round"
                  strokeOpacity={focusStrokeOpacity}
                  strokeWidth={edgeStrokeWidthFocus}
                />
              )}
            </g>
          );
        }

        const isNeighborEdge =
          neighborNodeIdSet.has(source.id) || neighborNodeIdSet.has(target.id);
        const baseEdgeOpacity = freeExploreMode
          ? isNeighborEdge
            ? edgeOpacities.exploreNeighbor
            : edgeOpacities.exploreDim
          : isNeighborEdge
            ? edgeOpacities.neighbor
            : edgeOpacities.dim;
        const edgeOpacity = freeExploreMode
          ? baseEdgeOpacity
          : showFullGraph
            ? (() => {
                const layoutDx = target.x - source.x;
                const layoutDy = target.y - source.y;
                const distance = Math.sqrt(
                  layoutDx * layoutDx + layoutDy * layoutDy,
                );
                const normalizedDistance =
                  linkDistanceRange.distanceRange > 0
                    ? (distance - linkDistanceRange.minDistance) /
                      linkDistanceRange.distanceRange
                    : 0;
                return 0.6 - normalizedDistance * 0.59;
              })()
            : baseEdgeOpacity;
        return (
          <g key={`path-${dirKey}-${i}`}>
            <path
              data-edge-key={dirKey}
              d={pathD}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={edgeStrokeWidthNormal}
              strokeOpacity={edgeOpacity}
            />
          </g>
        );
      })}

      {/* 2. エッジラベルをパスの前面に描画（ノード対ごとに1つだけ） */}
      {Array.from(linksByNodePair.entries()).map(([pairKey, linksInPair]) => {
        const link = linksInPair[0];
        if (!link) return null;
        const source = link.source as CustomNodeType;
        const target = link.target as CustomNodeType;
        if (
          !source ||
          !target ||
          source.x == null ||
          source.y == null ||
          target.x == null ||
          target.y == null
        )
          return null;
        const pairCount = linksInPair.length;
        const typesInPair = linksInPair
          .map((l) => l.type ?? "")
          .filter(Boolean);
        const isFocusEdge = linksInPair.some((l) =>
          focusEdgeIdSet.has(getEdgeCompositeKeyFromLink(l)),
        );
        const showThisEdgeLabel =
          typesInPair.length > 0 &&
          (showEdgeLabels ||
            (isFocusEdge && !freeExploreMode && !showFullGraph));
        if (!showThisEdgeLabel) return null;

        const [sx, sy] = nodeViewWithPair(source);
        const [tx, ty] = nodeViewWithPair(target);
        const len = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2) || 1;

        const {
          x: labelX,
          y: labelY,
          angle,
        } = calcEdgeLabelPos(sx, sy, tx, ty, hasExplicitEdges, isFocusEdge);

        const labelTextLength =
          expandedEdgePairKey === pairKey && pairCount > 1
            ? Math.max(...typesInPair.map((t) => t.length))
            : pairCount > 1
              ? (typesInPair[0]?.length ?? 0) + 3
              : (typesInPair[0]?.length ?? 1);
        const baseEdgeLabelFontSize = getEdgeLabelFontSize(isFocusEdge);
        const maxFontSizeByEdge = getMaxEdgeLabelFontSizeByLength(
          len,
          labelTextLength,
        );
        const effectiveEdgeLabelFontSize = Math.max(
          4,
          Math.min(baseEdgeLabelFontSize, maxFontSizeByEdge),
        );
        const handleLabelClick =
          pairCount > 1
            ? (e: React.MouseEvent) => {
                e.stopPropagation();
                setExpandedEdgePairKey((prev) =>
                  prev === pairKey ? null : pairKey,
                );
              }
            : undefined;

        const labelContent =
          expandedEdgePairKey === pairKey && pairCount > 1
            ? typesInPair.map((t, j) => (
                <tspan
                  key={`${t}-${j}`}
                  x={0}
                  dy={j === 0 ? 0 : `${j * 1.2}em`}
                >
                  {t}
                </tspan>
              ))
            : pairCount > 1
              ? `${typesInPair[0]} …`
              : typesInPair[0];

        if (hasExplicitEdges && isFocusEdge) {
          return (
            <g
              key={`label-${pairKey}`}
              data-edge-label-key={pairKey}
              transform={`translate(${labelX},${labelY}) rotate(${angle})`}
            >
              <text
                x={0}
                y={0}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={effectiveEdgeLabelFontSize}
                className={
                  pairCount > 1 ? "cursor-pointer" : "pointer-events-none"
                }
                opacity={Math.max(0, Math.min(1, edgeRevealProgress * 2 - 0.5))}
                onClick={handleLabelClick}
              >
                {labelContent}
              </text>
            </g>
          );
        }

        const isNeighborEdge =
          neighborNodeIdSet.has(source.id) || neighborNodeIdSet.has(target.id);
        const baseEdgeOpacity = freeExploreMode
          ? isNeighborEdge
            ? edgeOpacities.exploreNeighbor
            : edgeOpacities.exploreDim
          : isNeighborEdge
            ? edgeOpacities.neighbor
            : edgeOpacities.dim;
        const edgeOpacity = freeExploreMode
          ? baseEdgeOpacity
          : showFullGraph
            ? (() => {
                const layoutDx = target.x - source.x;
                const layoutDy = target.y - source.y;
                const distance = Math.sqrt(
                  layoutDx * layoutDx + layoutDy * layoutDy,
                );
                const normalizedDistance =
                  linkDistanceRange.distanceRange > 0
                    ? (distance - linkDistanceRange.minDistance) /
                      linkDistanceRange.distanceRange
                    : 0;
                return 0.6 - normalizedDistance * 0.59;
              })()
            : baseEdgeOpacity;
        return (
          <g
            key={`label-${pairKey}`}
            data-edge-label-key={pairKey}
            transform={`translate(${labelX},${labelY}) rotate(${angle})`}
          >
            <text
              x={0}
              y={0}
              textAnchor="middle"
              fill="#646368"
              fontSize={effectiveEdgeLabelFontSize}
              className={
                pairCount > 1 ? "cursor-pointer" : "pointer-events-none"
              }
              style={{
                opacity: edgeOpacity,
                ...(segmentProgress != null
                  ? undefined
                  : !isPc && { transition: "opacity 100ms ease-out" }),
              }}
              opacity={edgeRevealProgress}
              onClick={handleLabelClick}
            >
              {labelContent}
            </text>
          </g>
        );
      })}

      {/* 3. ノードをエッジ・ラベルの前面に描画 */}
      {visibleNodesToRender.map((node) => {
        if (node.x == null || node.y == null) return null;
        const isFocusNode = focusNodeIdSet.has(node.id);
        const [vx, vy] = nodeViewWithPair(node);
        const opacity = getNodeOpacity(node);
        const baseR = getNodeRadius(node) * (0.8 / Math.max(1, scaleForSize));
        const pairXform = getNodePairTransform?.(node.id) ?? null;
        const basePulse = focusNodeIdSet.has(node.id) ? nodePulseScale : 1;
        const combinedScale = basePulse * (pairXform?.scale ?? 1);
        const imageUrl = node.properties?.imageUrl as string | undefined;
        const showImage = imageUrl && !failedImageNodeIds.has(node.id);
        const rRaw = imageUrl ? baseR * 2.5 : baseR;
        const r =
          freeExploreMode && scaleForSize > 1
            ? Math.max(MIN_DISPLAY_NODE_RADIUS, rRaw)
            : rRaw;
        const shouldShowThisNodeLabel =
          freeExploreMode || showFullGraph
            ? true
            : effectiveScaleForLabels >= 1.0
              ? true
              : neighborNodeIdSet.has(node.id);

        return (
          <g
            key={node.id}
            data-node-id={node.id}
            transform={`translate(${vx}, ${vy})`}
            style={{
              opacity,
              ...(segmentProgress != null
                ? undefined
                : !isPc && { transition: "opacity 100ms ease-out" }),
              ...(freeExploreMode && {
                cursor: draggingNodeId === node.id ? "grabbing" : "grab",
              }),
            }}
          >
            <g
              transform={
                combinedScale !== 1 ? `scale(${combinedScale})` : undefined
              }
            >
              {showImage ? (
                <>
                  <defs>
                    <clipPath id={`node-image-clip-${node.id}`}>
                      <circle r={r} />
                    </clipPath>
                  </defs>
                  <g clipPath={`url(#node-image-clip-${node.id})`}>
                    <image
                      x={-r}
                      y={-r}
                      width={r * 2}
                      height={r * 2}
                      href={imageUrl}
                      preserveAspectRatio="xMidYMid slice"
                      onError={() => {
                        setFailedImageNodeIds((prev) =>
                          new Set(prev).add(node.id),
                        );
                      }}
                    />
                  </g>
                  <circle
                    r={r}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={nodeStrokeWidth}
                  />
                </>
              ) : (
                <circle
                  r={r}
                  fill="#e2e8f0"
                  stroke="#94a3b8"
                  strokeWidth={nodeStrokeWidth / 2}
                />
              )}
              {shouldShowThisNodeLabel &&
                getNodeLabelFontSize(isFocusNode) > 0 && (
                  <text
                    y={-10}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize={getNodeLabelFontSize(isFocusNode)}
                    fontWeight={focusNodeIdSet.has(node.id) ? "bold" : "normal"}
                    className="pointer-events-none select-none"
                  >
                    {node.name}
                  </text>
                )}
            </g>
          </g>
        );
      })}

      {/* 4. ノードペアの具象 motion scene はノード circle より前面に描画 */}
      {pathItemsWithFocusIndex.map((item, i) => {
        const link = item.link;
        const source = link.source as CustomNodeType;
        const target = link.target as CustomNodeType;
        if (
          !hasExplicitEdges ||
          !item.hasFocus ||
          !source ||
          !target ||
          source.x == null ||
          source.y == null ||
          target.x == null ||
          target.y == null
        ) {
          return null;
        }

        const motionConfig = getEdgeMotionConfig?.(link.id) ?? null;
        if (!motionConfig) return null;

        const isSequencedCdtEdge = activeSemanticEdgeIds != null;
        const isActiveCdtEdge =
          !isSequencedCdtEdge || activeSemanticEdgeIds.has(link.id);
        if (!isActiveCdtEdge) return null;

        const [sx, sy] = nodeViewWithPair(source);
        const [tx, ty] = nodeViewWithPair(target);
        const effectiveEdgeProgress = freeExploreMode
          ? 1
          : showFullGraph
            ? overviewEdgeProgress
            : edgeRevealProgress;

        return (
          <EdgeSemanticMotionScene
            key={`semantic-motion-scene-${link.id}-${i}`}
            config={motionConfig}
            sourceX={sx}
            sourceY={sy}
            targetX={tx}
            targetY={ty}
            displayScale={displayScale}
            opacity={Math.max(0, Math.min(1, effectiveEdgeProgress * 2 - 0.5))}
          />
        );
      })}
    </g>
  );
}
