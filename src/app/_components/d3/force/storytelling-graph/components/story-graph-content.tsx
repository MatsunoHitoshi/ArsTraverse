import type React from "react";
import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import { getEdgeCompositeKeyFromLink } from "@/app/const/story-segment";
import { getMaxEdgeLabelFontSizeByLength } from "@/app/_utils/graph-label-utils";
import { getDirectionalKey } from "../utils/graph-utils";

const MIN_DISPLAY_NODE_RADIUS = 3;

type CommunityDisplay = {
  communityId: string;
  title?: string;
  centerX: number;
  centerY: number;
  radius: number;
};

export function StoryGraphContent(props: {
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
  displayProgress: number;
  fadeProgress: number;
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
}) {
  const {
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
    displayProgress,
    fadeProgress,
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
  } = props;

  return (
    <g>
      {shouldRunSteadyAnim && edgeFlowStops && (
        <defs>
          {pathItemsWithFocusIndex
            .filter((item) => item.hasFocus)
            .map((item, i) => {
              const link = item.link;
              const src = link.source as CustomNodeType;
              const tgt = link.target as CustomNodeType;
              if (!src || !tgt || src.x == null || src.y == null || tgt.x == null || tgt.y == null) return null;
              const [gsx, gsy] = toView(src.x, src.y);
              const [gtx, gty] = toView(tgt.x, tgt.y);
              return (
                <linearGradient key={`edge-flow-${i}`} id={`edge-flow-${i}`} gradientUnits="userSpaceOnUse" x1={gsx} y1={gsy} x2={gtx} y2={gty}>
                  {edgeFlowStops.map((stop, j) => (
                    <stop key={j} offset={stop.offset} stopColor="#94a3b8" stopOpacity={stop.opacity} />
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
                <radialGradient key={gradientId} id={gradientId} cx="50%" cy="50%" r="50%">
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
                <circle cx={vx} cy={vy} r={viewRadius} fill={`url(#${gradientId})`} stroke="#334155" strokeWidth={1} strokeOpacity={0.4} className="pointer-events-none" />
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

      {pathItemsWithFocusIndex.map((item, i) => {
        const link = item.link;
        const source = link.source as CustomNodeType;
        const target = link.target as CustomNodeType;
        if (!source || !target || source.x == null || source.y == null || target.x == null || target.y == null) return null;
        const [sx, sy] = toView(source.x, source.y);
        const [tx, ty] = toView(target.x, target.y);
        const dirKey = getDirectionalKey(link);
        const pathD = `M ${sx} ${sy} L ${tx} ${ty}`;
        const isFocusEdge = item.hasFocus;
        const edgeProgress = segmentBranch ? displayProgress : (fadeProgress < 1 ? fadeProgress : displayProgress);
        const effectiveEdgeProgress = freeExploreMode ? 1 : showFullGraph && isFocusEdge ? overviewEdgeProgress : edgeProgress;

        if (hasExplicitEdges && isFocusEdge) {
          const focusStrokeOpacity =
            freeExploreMode
              ? edgeOpacities.focus
              : showFullGraph
                ? (() => {
                    const layoutDx = target.x - source.x;
                    const layoutDy = target.y - source.y;
                    const distance = Math.sqrt(layoutDx * layoutDx + layoutDy * layoutDy);
                    const normalizedDistance =
                      linkDistanceRange.distanceRange > 0
                        ? (distance - linkDistanceRange.minDistance) / linkDistanceRange.distanceRange
                        : 0;
                    return 0.6 - normalizedDistance * 0.59;
                  })()
                : edgeOpacities.focus;
          const useFlowGrad =
            shouldRunSteadyAnim &&
            edgeFlowStops != null &&
            (!segmentBranch || (segmentProgress ?? 1) >= 1);
          return (
            <g key={`path-${dirKey}-${i}`}>
              {useFlowGrad ? (
                <path d={pathD} fill="none" stroke={`url(#edge-flow-${item.focusGradientIndex})`} strokeLinecap="round" strokeWidth={edgeStrokeWidthFocus} />
              ) : (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#94a3b8"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - effectiveEdgeProgress}
                  style={segmentProgress != null ? undefined : !isPc ? { transition: "stroke-dashoffset 100ms ease-out" } : undefined}
                  strokeLinecap="round"
                  strokeOpacity={focusStrokeOpacity}
                  strokeWidth={edgeStrokeWidthFocus}
                />
              )}
            </g>
          );
        }

        const isNeighborEdge = neighborNodeIdSet.has(source.id) || neighborNodeIdSet.has(target.id);
        const baseEdgeOpacity = freeExploreMode
          ? isNeighborEdge
            ? edgeOpacities.exploreNeighbor
            : edgeOpacities.exploreDim
          : isNeighborEdge
            ? edgeOpacities.neighbor
            : edgeOpacities.dim;
        const edgeOpacity =
          freeExploreMode
            ? baseEdgeOpacity
            : showFullGraph
              ? (() => {
                  const layoutDx = target.x - source.x;
                  const layoutDy = target.y - source.y;
                  const distance = Math.sqrt(layoutDx * layoutDx + layoutDy * layoutDy);
                  const normalizedDistance =
                    linkDistanceRange.distanceRange > 0
                      ? (distance - linkDistanceRange.minDistance) / linkDistanceRange.distanceRange
                      : 0;
                  return 0.6 - normalizedDistance * 0.59;
                })()
              : baseEdgeOpacity;
        return (
          <g key={`path-${dirKey}-${i}`}>
            <path d={pathD} fill="none" stroke="#94a3b8" strokeWidth={edgeStrokeWidthNormal} strokeOpacity={edgeOpacity} />
          </g>
        );
      })}

      {Array.from(linksByNodePair.entries()).map(([pairKey, linksInPair]) => {
        const link = linksInPair[0];
        if (!link) return null;
        const source = link.source as CustomNodeType;
        const target = link.target as CustomNodeType;
        if (!source || !target || source.x == null || source.y == null || target.x == null || target.y == null) return null;
        const pairCount = linksInPair.length;
        const typesInPair = linksInPair.map((l) => l.type ?? "").filter(Boolean);
        const isFocusEdge = linksInPair.some((l) => focusEdgeIdSet.has(getEdgeCompositeKeyFromLink(l)));
        const showThisEdgeLabel = typesInPair.length > 0 && (showEdgeLabels || (isFocusEdge && !freeExploreMode && !showFullGraph));
        if (!showThisEdgeLabel) return null;

        const [sx, sy] = toView(source.x, source.y);
        const [tx, ty] = toView(target.x, target.y);
        const dx = tx - sx;
        const dy = ty - sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const labelOffsetPx = hasExplicitEdges && isFocusEdge ? 8 : 4;
        const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const perpSign = rawAngleDeg > 90 && rawAngleDeg <= 270 ? -1 : 1;
        const is90To180 = rawAngleDeg > -180 && rawAngleDeg <= -90;
        const extraOffsetPx = is90To180 ? (hasExplicitEdges && isFocusEdge ? 8 : 4) : 0;
        const effectiveOffsetPx = labelOffsetPx + extraOffsetPx;
        const perpX = (dy / len) * effectiveOffsetPx * perpSign;
        const perpY = (-dx / len) * effectiveOffsetPx * perpSign;
        let angle = rawAngleDeg;
        if (angle > 90) angle -= 180;
        else if (angle < -90) angle += 180;
        const labelX = (sx + tx) / 2 + perpX;
        const labelY = (sy + ty) / 2 + perpY;
        const labelTransform = `rotate(${angle}, ${labelX}, ${labelY})`;
        const effectiveEdgeProgress = freeExploreMode ? 1 : (segmentBranch ? displayProgress : (fadeProgress < 1 ? fadeProgress : displayProgress));
        const labelTextLength =
          expandedEdgePairKey === pairKey && pairCount > 1
            ? Math.max(...typesInPair.map((t) => t.length))
            : pairCount > 1
              ? (typesInPair[0]?.length ?? 0) + 3
              : typesInPair[0]?.length ?? 1;
        const baseEdgeLabelFontSize = getEdgeLabelFontSize(isFocusEdge);
        const maxFontSizeByEdge = getMaxEdgeLabelFontSizeByLength(len, labelTextLength);
        const effectiveEdgeLabelFontSize = Math.max(4, Math.min(baseEdgeLabelFontSize, maxFontSizeByEdge));
        const handleLabelClick =
          pairCount > 1
            ? (e: React.MouseEvent) => {
                e.stopPropagation();
                setExpandedEdgePairKey((prev) => (prev === pairKey ? null : pairKey));
              }
            : undefined;

        if (hasExplicitEdges && isFocusEdge) {
          return (
            <g key={`label-${pairKey}`}>
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={effectiveEdgeLabelFontSize}
                className={pairCount > 1 ? "cursor-pointer" : "pointer-events-none"}
                transform={labelTransform}
                opacity={Math.max(0, Math.min(1, effectiveEdgeProgress * 2 - 0.5))}
                onClick={handleLabelClick}
              >
                {expandedEdgePairKey === pairKey && pairCount > 1
                  ? typesInPair.map((t, j) => (
                      <tspan key={`${t}-${j}`} x={labelX} y={labelY} dy={j === 0 ? 0 : `${j * 1.2}em`}>
                        {t}
                      </tspan>
                    ))
                  : pairCount > 1
                    ? `${typesInPair[0]} …`
                    : typesInPair[0]}
              </text>
            </g>
          );
        }

        const isNeighborEdge = neighborNodeIdSet.has(source.id) || neighborNodeIdSet.has(target.id);
        const baseEdgeOpacity = freeExploreMode
          ? isNeighborEdge
            ? edgeOpacities.exploreNeighbor
            : edgeOpacities.exploreDim
          : isNeighborEdge
            ? edgeOpacities.neighbor
            : edgeOpacities.dim;
        const edgeOpacity =
          freeExploreMode
            ? baseEdgeOpacity
            : showFullGraph
              ? (() => {
                  const layoutDx = target.x - source.x;
                  const layoutDy = target.y - source.y;
                  const distance = Math.sqrt(layoutDx * layoutDx + layoutDy * layoutDy);
                  const normalizedDistance =
                    linkDistanceRange.distanceRange > 0
                      ? (distance - linkDistanceRange.minDistance) / linkDistanceRange.distanceRange
                      : 0;
                  return 0.6 - normalizedDistance * 0.59;
                })()
              : baseEdgeOpacity;
        return (
          <g key={`label-${pairKey}`}>
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              fill="#646368"
              fontSize={effectiveEdgeLabelFontSize}
              className={pairCount > 1 ? "cursor-pointer" : "pointer-events-none"}
              transform={labelTransform}
              style={{
                opacity: edgeOpacity,
                ...(segmentProgress != null ? undefined : !isPc && { transition: "opacity 100ms ease-out" }),
              }}
              opacity={effectiveEdgeProgress}
              onClick={handleLabelClick}
            >
              {expandedEdgePairKey === pairKey && pairCount > 1
                ? typesInPair.map((t, j) => (
                    <tspan key={`${t}-${j}`} x={labelX} y={labelY} dy={j === 0 ? 0 : `${j * 1.2}em`}>
                      {t}
                    </tspan>
                  ))
                : pairCount > 1
                  ? `${typesInPair[0]} …`
                  : typesInPair[0]}
            </text>
          </g>
        );
      })}

      {visibleNodesToRender.map((node) => {
        if (node.x == null || node.y == null) return null;
        const isFocusNode = focusNodeIdSet.has(node.id);
        const [vx, vy] = toView(node.x, node.y);
        const opacity = getNodeOpacity(node);
        const baseR = getNodeRadius(node) * (0.8 / Math.max(1, scaleForSize));
        const pulseScale = focusNodeIdSet.has(node.id) ? nodePulseScale : 1;
        const imageUrl = node.properties?.imageUrl as string | undefined;
        const showImage = imageUrl && !failedImageNodeIds.has(node.id);
        const rRaw = imageUrl ? baseR * 2.5 : baseR;
        const r = freeExploreMode && scaleForSize > 1 ? Math.max(MIN_DISPLAY_NODE_RADIUS, rRaw) : rRaw;
        const shouldShowThisNodeLabel =
          freeExploreMode || showFullGraph
            ? true
            : effectiveScaleForLabels >= 1.0
              ? true
              : neighborNodeIdSet.has(node.id);

        return (
          <g
            key={node.id}
            data-node-id={freeExploreMode ? node.id : undefined}
            transform={`translate(${vx}, ${vy})`}
            style={{
              opacity,
              ...(segmentProgress != null ? undefined : !isPc && { transition: "opacity 100ms ease-out" }),
              ...(freeExploreMode && {
                cursor: draggingNodeId === node.id ? "grabbing" : "grab",
              }),
            }}
          >
            <g transform={pulseScale !== 1 ? `scale(${pulseScale})` : undefined}>
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
                        setFailedImageNodeIds((prev) => new Set(prev).add(node.id));
                      }}
                    />
                  </g>
                  <circle r={r} fill="none" stroke="#94a3b8" strokeWidth={nodeStrokeWidth} />
                </>
              ) : (
                <circle r={r} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={nodeStrokeWidth / 2} />
              )}
              {shouldShowThisNodeLabel && getNodeLabelFontSize(isFocusNode) > 0 && (
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
    </g>
  );
}
