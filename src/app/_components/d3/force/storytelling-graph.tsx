"use client";

import type {
  CustomNodeType,
  CustomLinkType,
  GraphDocumentForFrontend,
  LayoutInstruction,
} from "@/app/const/types";
import { getEdgeCompositeKeyFromLink } from "@/app/const/story-segment";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3";
import type { Simulation, ForceLink } from "d3";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  filterGraphBySegmentFocusWithNeighbors as getSubgraphForStep,
} from "@/app/_utils/kg/filter-graph-by-segment-focus";
import { filterGraphByLayoutInstruction } from "@/app/_utils/kg/filter-graph-by-layout-instruction";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";

const NODE_RADIUS = 8;
const LINK_DISTANCE = 80;
const FOCUS_NODE_OPACITY = 1;
const NEIGHBOR_NODE_OPACITY = 0.35;
const FOCUS_EDGE_OPACITY = 1;
const NEIGHBOR_EDGE_OPACITY = 0.35;

/** 出る側ノードのフェードイン完了までに使う progress の割合 (0–1) */
const SOURCE_FADE_END = 0.25;
/** 入る側ノードのフェードイン開始となる progress の閾値 */
const TARGET_FADE_START = 0.45;
/** 入る側ノードのフェードインに要する progress の幅 */
const TARGET_FADE_DURATION = 0.35;

export const StorytellingGraph = memo(function StorytellingGraph({
  graphDocument,
  focusNodeIds,
  focusEdgeIds,
  animationProgress,
  width,
  height,
  filter,
}: {
  graphDocument: GraphDocumentForFrontend;
  focusNodeIds: string[];
  focusEdgeIds: string[];
  animationProgress: number;
  width: number;
  height: number;
  filter?: LayoutInstruction["filter"];
}) {
  const baseGraph = useMemo(() => {
    if (filter) {
      return filterGraphByLayoutInstruction(graphDocument, filter);
    }
    return graphDocument;
  }, [graphDocument, filter]);

  const subGraph = useMemo((): GraphDocumentForFrontend | undefined => {
    /* getSubgraphForStep is typed GraphDocumentForFrontend | undefined; eslint mis-infers as error */
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
    const result = getSubgraphForStep(baseGraph, focusNodeIds, focusEdgeIds);
    return result ?? undefined;
  }, [baseGraph, focusNodeIds, focusEdgeIds]);

  const focusNodeIdSet = useMemo(
    () => new Set(focusNodeIds),
    [focusNodeIds],
  );
  const focusEdgeIdSet = useMemo(
    () => new Set(focusEdgeIds),
    [focusEdgeIds],
  );
  const hasExplicitEdges = focusEdgeIds.length > 0;

  const initNodes = useMemo((): CustomNodeType[] => {
    if (!subGraph?.nodes.length) return [];
    return subGraph.nodes.map((n) => ({
      ...n,
      x: width / 2,
      y: height / 2,
    }));
  }, [subGraph?.nodes, width, height]);

  const initLinks = useMemo((): CustomLinkType[] => {
    if (!subGraph?.relationships?.length || !initNodes.length) return [];
    return subGraph.relationships
      .map((rel) => {
        const source = getNodeByIdForFrontend(rel.sourceId, initNodes);
        const target = getNodeByIdForFrontend(rel.targetId, initNodes);
        if (!source || !target) {
          console.warn("[StorytellingGraph] initLinks: 存在しないノードへの参照を除外", {
            linkId: rel.id,
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            missingSource: !source,
            missingTarget: !target,
          });
          return null;
        }
        return {
          ...rel,
          source,
          target,
        };
      })
      .filter((link): link is NonNullable<typeof link> => link != null) as CustomLinkType[];
  }, [subGraph?.relationships, initNodes]);

  const [nodes, setNodes] = useState<CustomNodeType[]>(initNodes);
  const [links, setLinks] = useState<CustomLinkType[]>(initLinks);
  const simulationRef = useRef<Simulation<CustomNodeType, CustomLinkType> | null>(null);

  useEffect(() => {
    if (width <= 0 || height <= 0 || !initNodes.length) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const simulation = forceSimulation<CustomNodeType, CustomLinkType>(initNodes)
      .force(
        "link",
        forceLink<CustomNodeType, CustomLinkType>(initLinks)
          .id((d) => d.id)
          .distance(LINK_DISTANCE)
          .strength(0.3),
      )
      .force("charge", forceManyBody().strength(-120))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(NODE_RADIUS + 4));

    simulation.stop();
    simulation.tick(200);

    setNodes([...simulation.nodes()]);
    const linkForce = simulation.force<ForceLink<CustomNodeType, CustomLinkType>>("link");
    if (linkForce?.links) {
      setLinks([...linkForce.links()]);
    }
    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [initNodes, initLinks, width, height]);

  const progress = Math.max(0, Math.min(1, animationProgress * 2));
  // const linkProgress = Math.max(0, Math.min(1, progress * 2));

  // フォーカスエッジの「出る側」「入る側」ノードID（リッチアニメーション用）
  const { sourceNodeIdsOfFocusEdges, targetNodeIdsOfFocusEdges } = useMemo(() => {
    const sourceIds = new Set<string>();
    const targetIds = new Set<string>();
    links.forEach((link) => {
      const key = getEdgeCompositeKeyFromLink(link);
      if (!focusEdgeIdSet.has(key)) return;
      const src = link.source as CustomNodeType;
      const tgt = link.target as CustomNodeType;
      sourceIds.add(src.id);
      targetIds.add(tgt.id);
    });
    return {
      sourceNodeIdsOfFocusEdges: sourceIds,
      targetNodeIdsOfFocusEdges: targetIds,
    };
  }, [links, focusEdgeIdSet]);

  const getNodeOpacity = useCallback(
    (node: CustomNodeType): number => {
      const isFocus = focusNodeIdSet.has(node.id);
      const isSource = sourceNodeIdsOfFocusEdges.has(node.id);
      const isTarget = targetNodeIdsOfFocusEdges.has(node.id);
      const maxOpacity = isFocus ? FOCUS_NODE_OPACITY : NEIGHBOR_NODE_OPACITY;

      if (!hasExplicitEdges) {
        return isFocus ? FOCUS_NODE_OPACITY : NEIGHBOR_NODE_OPACITY;
      }

      // 出る側のみ: 最初にフェードイン（フォーカス・隣接とも同じタイミング）
      if (isSource && !isTarget) {
        if (progress >= SOURCE_FADE_END) return maxOpacity;
        return (progress / SOURCE_FADE_END) * maxOpacity;
      }
      // 入る側のみ: エッジの後から遅れてフェードイン
      if (isTarget && !isSource) {
        if (progress <= TARGET_FADE_START) return 0;
        if (progress >= TARGET_FADE_START + TARGET_FADE_DURATION)
          return maxOpacity;
        const t = (progress - TARGET_FADE_START) / TARGET_FADE_DURATION;
        return t * maxOpacity;
      }
      // 両方: 出る側として先に表示
      if (isSource && isTarget) {
        if (progress >= SOURCE_FADE_END) return maxOpacity;
        return (progress / SOURCE_FADE_END) * maxOpacity;
      }
      // フォーカスエッジの端点でないノード: 最初から表示
      return maxOpacity;
    },
    [
      focusNodeIdSet,
      hasExplicitEdges,
      progress,
      sourceNodeIdsOfFocusEdges,
      targetNodeIdsOfFocusEdges,
    ],
  );

  if (!subGraph || subGraph.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg text-slate-400 text-sm"
        style={{ width, height }}
      >
        このセグメントにはグラフがありません
      </div>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible"
      style={{ maxWidth: "100%", height: "auto" }}
    >
      <g>
        {links.map((link, i) => {
          const source = link.source as CustomNodeType;
          const target = link.target as CustomNodeType;
          if (
            !source ||
            !target ||
            source.x == null ||
            source.y == null ||
            target.x == null ||
            target.y == null
          ) {
            return null;
          }
          const key = getEdgeCompositeKeyFromLink(link);
          const pathD = `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
          const isFocusEdge = focusEdgeIdSet.has(key);
          // エッジの角度に合わせてラベルを回転（generative-layout-graph.tsx と同様）
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          // 左へ90度以上傾いたときはラベルを180度反転して読みやすくする
          if (angle > 90) angle -= 180;
          else if (angle < -90) angle += 180;
          const labelX = (source.x + target.x) / 2;
          const labelY = (source.y + target.y) / 2;
          const labelTransform = `rotate(${angle}, ${labelX}, ${labelY})`;

          if (hasExplicitEdges && isFocusEdge) {
            return (
              <g key={`${key}-${i}`}>
                {/* <path
                  d={pathD}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth={1.5}
                  strokeOpacity={NEIGHBOR_EDGE_OPACITY}
                /> */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - progress}
                  strokeLinecap="round"
                  strokeOpacity={FOCUS_EDGE_OPACITY}
                />
                {link.type && (
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize={8}
                    className="pointer-events-none"
                    transform={labelTransform}
                    opacity={Math.max(0, Math.min(1, progress * 2 - 0.5))}
                  >
                    {link.type}
                  </text>
                )}
              </g>
            );
          }
          return (
            <g key={`${key}-${i}`}>
              <path
                d={pathD}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeOpacity={NEIGHBOR_EDGE_OPACITY}
              />
              {link.type && (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={8}
                  className="pointer-events-none"
                  transform={labelTransform}
                  style={{ opacity: NEIGHBOR_EDGE_OPACITY }}
                  opacity={progress}
                >
                  {link.type}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((node) => {
          if (node.x == null || node.y == null) return null;
          const opacity = getNodeOpacity(node);
          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              style={{ opacity }}
            >
              <circle
                r={NODE_RADIUS}
                fill="#e2e8f0"
                stroke="#94a3b8"
                strokeWidth={1.5}
              />
              <text
                y={NODE_RADIUS + 14}
                textAnchor="middle"
                fill="#e2e8f0"
                fontSize={11}
                className="pointer-events-none select-none"
              >
                {node.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
});
