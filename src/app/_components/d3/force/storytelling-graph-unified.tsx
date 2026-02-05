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
import { select } from "d3";
import type { Simulation, ForceLink } from "d3";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { filterGraphByLayoutInstruction } from "@/app/_utils/kg/filter-graph-by-layout-instruction";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";
import { D3ZoomProvider } from "../zoom";

const NODE_RADIUS = 3;
const LINK_DISTANCE = 80;
/** フォーカスが1点のとき scale が暴れないよう cap する */
const MAX_VIEW_SCALE = 3;
const FOCUS_NODE_OPACITY = 1;
const NEIGHBOR_NODE_OPACITY = 0.12;
/** フォーカス・隣接以外のノードをほんのり表示する不透明度 */
const DIM_NODE_OPACITY = 0.06;
const FOCUS_EDGE_OPACITY = 1;
const NEIGHBOR_EDGE_OPACITY = 0.12;
/** フォーカス・隣接以外のエッジをほんのり表示する不透明度 */
const DIM_EDGE_OPACITY = 0.06;

/** フォーカス遷移アニメーションの所要時間（ms） */
const FOCUS_TRANSITION_MS = 800;
/** フェード開始を遅らせるオフセット（ms）。ビュー遷移を先行させる */
const FADE_DELAY_MS = 80;
/** フェードアニメーションの所要時間（ms）。FADE_DELAY_MS 経過後からこの時間で 0→1 */
const FADE_DURATION_MS = FOCUS_TRANSITION_MS - FADE_DELAY_MS;

/** 出る側ノードのフェードイン完了までに使う progress の割合 (0–1) */
const SOURCE_FADE_END = 0.25;
/** 入る側ノードのフェードイン開始となる progress の閾値 */
const TARGET_FADE_START = 0.45;
/** 入る側ノードのフェードインに要する progress の幅 */
const TARGET_FADE_DURATION = 0.35;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 最初と最後をゆるく、中間を速く（カメラ遷移用） */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export const StorytellingGraphUnified = memo(function StorytellingGraphUnified({
  graphDocument,
  focusNodeIds,
  focusEdgeIds,
  animationProgress,
  width,
  height,
  filter,
  freeExploreMode = false,
  showBottomFadeGradient = false,
}: {
  graphDocument: GraphDocumentForFrontend;
  focusNodeIds: string[];
  focusEdgeIds: string[];
  animationProgress: number;
  width: number;
  height: number;
  filter?: LayoutInstruction["filter"];
  freeExploreMode?: boolean;
  /** SP時など、下端96pxを透明化グラデーションで隠すか */
  showBottomFadeGradient?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomX, setZoomX] = useState(0);
  const [zoomY, setZoomY] = useState(0);

  // 自由探索モードを抜けたときにズームをリセットし、D3のzoomリスナーを外す
  useEffect(() => {
    if (!freeExploreMode) {
      setZoomScale(1);
      setZoomX(0);
      setZoomY(0);
      if (svgRef.current) {
        select(svgRef.current).on(".zoom", null);
      }
    }
  }, [freeExploreMode]);
  const baseGraph = useMemo(() => {
    if (filter) {
      return filterGraphByLayoutInstruction(graphDocument, filter);
    }
    return graphDocument;
  }, [graphDocument, filter]);

  // レイアウト・描画は baseGraph 全体を使う（絞り込まない）
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
    if (!baseGraph?.nodes?.length) return [];
    return baseGraph.nodes.map((n) => ({
      ...n,
      x: width / 2,
      y: height / 2,
    }));
  }, [baseGraph?.nodes, width, height]);

  const initLinks = useMemo((): CustomLinkType[] => {
    if (!baseGraph?.relationships?.length || !initNodes.length) return [];
    return baseGraph.relationships.map((rel) => {
      const source = getNodeByIdForFrontend(rel.sourceId, initNodes);
      const target = getNodeByIdForFrontend(rel.targetId, initNodes);
      return {
        ...rel,
        source: source ?? initNodes[0],
        target: target ?? initNodes[0],
      };
    }) as CustomLinkType[];
  }, [baseGraph?.relationships, initNodes]);

  const [nodes, setNodes] = useState<CustomNodeType[]>(initNodes);
  const [links, setLinks] = useState<CustomLinkType[]>(initLinks);
  const simulationRef = useRef<Simulation<CustomNodeType, CustomLinkType> | null>(null);

  // フォーカス遷移: 経過時間でビュー用・フェード用の進捗を導出（ビュー先行・フェード遅延）
  const lastFocusNodeIdsRef = useRef<string[]>(focusNodeIds);
  const lastFocusEdgeIdsRef = useRef<string[]>(focusEdgeIds);
  const [transitionFromNodeIds, setTransitionFromNodeIds] = useState<string[]>(focusNodeIds);
  /** 遷移開始からの経過 ms。遷移中でないときは FOCUS_TRANSITION_MS 以上にして viewProgress/fadeProgress を 1 にする */
  const [transitionElapsedMs, setTransitionElapsedMs] = useState(FOCUS_TRANSITION_MS);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const prevNodeIds = lastFocusNodeIdsRef.current;
    const prevEdgeIds = lastFocusEdgeIdsRef.current;
    const nodeIdsEqual =
      prevNodeIds.length === focusNodeIds.length &&
      prevNodeIds.every((id, i) => id === focusNodeIds[i]);
    const edgeIdsEqual =
      prevEdgeIds.length === focusEdgeIds.length &&
      prevEdgeIds.every((id, i) => id === focusEdgeIds[i]);

    if (nodeIdsEqual && edgeIdsEqual) {
      return;
    }

    setTransitionFromLayoutTransform(lastLayoutTransformRef.current);
    setTransitionFromNodeIds(prevNodeIds);
    lastFocusNodeIdsRef.current = focusNodeIds;
    lastFocusEdgeIdsRef.current = focusEdgeIds;
    setTransitionElapsedMs(0);
    startTimeRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current;
      setTransitionElapsedMs(Math.min(elapsed, FOCUS_TRANSITION_MS));
      if (elapsed < FOCUS_TRANSITION_MS) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [focusNodeIds, focusEdgeIds]);

  const isTransitionComplete = transitionElapsedMs >= FOCUS_TRANSITION_MS;

  const [transitionFromLayoutTransform, setTransitionFromLayoutTransform] = useState<{
    scale: number;
    centerX: number;
    centerY: number;
  }>({ scale: 1, centerX: 0, centerY: 0 });
  const lastLayoutTransformRef = useRef<{
    scale: number;
    centerX: number;
    centerY: number;
  }>({ scale: 1, centerX: 0, centerY: 0 });

  const viewProgress = useMemo(
    () =>
      isTransitionComplete
        ? 1
        : easeOutCubic(Math.min(1, transitionElapsedMs / FOCUS_TRANSITION_MS)),
    [transitionElapsedMs, isTransitionComplete],
  );
  const fadeProgress = useMemo(
    () =>
      isTransitionComplete
        ? 1
        : transitionElapsedMs <= FADE_DELAY_MS
          ? 0
          : easeOutCubic(
            Math.min(
              1,
              (transitionElapsedMs - FADE_DELAY_MS) / FADE_DURATION_MS,
            ),
          ),
    [transitionElapsedMs, isTransitionComplete],
  );

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
  /** 遷移完了後は親の progress が 0 から来ても二重アニメにしないため、常に max(progress, 1) を使う */
  const effectiveProgress =
    fadeProgress < 1 ? fadeProgress : Math.max(progress, 1);

  const transitionFromNodeIdSet = useMemo(
    () => new Set(transitionFromNodeIds),
    [transitionFromNodeIds],
  );

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

  /** フォーカス＋その1ホップ隣のノードID（それ以外は「ほんのり」表示） */
  const neighborNodeIdSet = useMemo(() => {
    const set = new Set<string>();
    focusNodeIds.forEach((id) => set.add(id));
    sourceNodeIdsOfFocusEdges.forEach((id) => set.add(id));
    targetNodeIdsOfFocusEdges.forEach((id) => set.add(id));
    links.forEach((link) => {
      const src = (link.source as CustomNodeType).id;
      const tgt = (link.target as CustomNodeType).id;
      if (set.has(src) || set.has(tgt)) {
        set.add(src);
        set.add(tgt);
      }
    });
    return set;
  }, [focusNodeIds, sourceNodeIdsOfFocusEdges, targetNodeIdsOfFocusEdges, links]);

  const getTargetNodeOpacity = useCallback(
    (node: CustomNodeType): number => {
      const isFocus = focusNodeIdSet.has(node.id);
      const isNeighbor = neighborNodeIdSet.has(node.id);
      const isSource = sourceNodeIdsOfFocusEdges.has(node.id);
      const isTarget = targetNodeIdsOfFocusEdges.has(node.id);
      const maxOpacity = isFocus
        ? FOCUS_NODE_OPACITY
        : isNeighbor
          ? NEIGHBOR_NODE_OPACITY
          : DIM_NODE_OPACITY;

      if (!hasExplicitEdges) {
        return maxOpacity;
      }
      if (isSource && !isTarget) {
        if (effectiveProgress >= SOURCE_FADE_END) return maxOpacity;
        return (effectiveProgress / SOURCE_FADE_END) * maxOpacity;
      }
      if (isTarget && !isSource) {
        if (effectiveProgress <= TARGET_FADE_START) return 0;
        if (effectiveProgress >= TARGET_FADE_START + TARGET_FADE_DURATION) return maxOpacity;
        const t = (effectiveProgress - TARGET_FADE_START) / TARGET_FADE_DURATION;
        return t * maxOpacity;
      }
      if (isSource && isTarget) {
        if (effectiveProgress >= SOURCE_FADE_END) return maxOpacity;
        return (effectiveProgress / SOURCE_FADE_END) * maxOpacity;
      }
      return maxOpacity;
    },
    [
      focusNodeIdSet,
      hasExplicitEdges,
      neighborNodeIdSet,
      effectiveProgress,
      sourceNodeIdsOfFocusEdges,
      targetNodeIdsOfFocusEdges,
    ],
  );

  const getPrevNodeOpacity = useCallback(
    (node: CustomNodeType): number => {
      const isFocus = transitionFromNodeIdSet.has(node.id);
      const isNeighbor = neighborNodeIdSet.has(node.id);
      return isFocus
        ? FOCUS_NODE_OPACITY
        : isNeighbor
          ? NEIGHBOR_NODE_OPACITY
          : DIM_NODE_OPACITY;
    },
    [transitionFromNodeIdSet, neighborNodeIdSet],
  );

  const getNodeOpacity = useCallback(
    (node: CustomNodeType): number => {
      const target = getTargetNodeOpacity(node);
      if (fadeProgress >= 1) return target;
      const prev = getPrevNodeOpacity(node);
      const eased = easeOutCubic(fadeProgress);
      return prev + (target - prev) * eased;
    },
    [fadeProgress, getTargetNodeOpacity, getPrevNodeOpacity],
  );

  // ビューはフォーカス部分グラフを中心とした局所範囲だけを viewBox に表示。フォーカス範囲の中心が viewBox の中央に来るようにする。
  const layoutTransform = useMemo(() => {
    if (!nodes.length) return { scale: 1, centerX: 0, centerY: 0 };
    const focusIds = new Set(focusNodeIds);
    links.forEach((link) => {
      const key = getEdgeCompositeKeyFromLink(link);
      if (focusEdgeIdSet.has(key)) {
        const src = link.source as CustomNodeType;
        const tgt = link.target as CustomNodeType;
        focusIds.add(src.id);
        focusIds.add(tgt.id);
      }
    });
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      if (!focusIds.has(n.id) || n.x == null || n.y == null) continue;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
    if (minX === Infinity) {
      for (const n of nodes) {
        if (n.x != null && n.y != null) {
          minX = Math.min(minX, n.x);
          minY = Math.min(minY, n.y);
          maxX = Math.max(maxX, n.x);
          maxY = Math.max(maxY, n.y);
        }
      }
    }
    if (minX === Infinity) return { scale: 0.8, centerX: 0, centerY: 0 };
    const paddingX = 32;
    const paddingY = 128; // 上下のみ 128
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const rawScale = Math.min(
      (width - 2 * paddingX) / rangeX,
      (height - 2 * paddingY) / rangeY,
    );
    const scale = Math.min(rawScale, MAX_VIEW_SCALE);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return { scale, centerX, centerY };
  }, [nodes, width, height, focusNodeIds, focusEdgeIdSet, links]);

  // 遷移が完了し、かつこのレンダーでフォーカスが変わっていないときだけ ref を更新する。
  // （フォーカス変更直後のレンダーで ref を更新すると、effect が「from」として新しい layout を
  //  読んでしまい A→B の補間が B→B になって見えなくなる）
  if (isTransitionComplete) {
    const prevNodeIds = lastFocusNodeIdsRef.current;
    const prevEdgeIds = lastFocusEdgeIdsRef.current;
    const nodeIdsMatch =
      prevNodeIds.length === focusNodeIds.length &&
      prevNodeIds.every((id, i) => id === focusNodeIds[i]);
    const edgeIdsMatch =
      prevEdgeIds.length === focusEdgeIds.length &&
      prevEdgeIds.every((id, i) => id === focusEdgeIds[i]);
    if (nodeIdsMatch && edgeIdsMatch) {
      lastLayoutTransformRef.current = layoutTransform;
    }
  }

  const { scale, centerX, centerY } = layoutTransform;
  const from = transitionFromLayoutTransform;
  const viewT = viewProgress >= 1 ? 1 : easeInOutCubic(viewProgress);
  const fromIsDefault =
    from.scale === 1 && from.centerX === 0 && from.centerY === 0;
  const interpolatedScale =
    viewProgress >= 1 || (viewProgress < 1 && fromIsDefault)
      ? scale
      : from.scale + (scale - from.scale) * viewT;
  const interpolatedCenterX =
    viewProgress >= 1 || (viewProgress < 1 && fromIsDefault)
      ? centerX
      : from.centerX + (centerX - from.centerX) * viewT;
  const interpolatedCenterY =
    viewProgress >= 1 || (viewProgress < 1 && fromIsDefault)
      ? centerY
      : from.centerY + (centerY - from.centerY) * viewT;

  // フォーカス変更の「最初の1フレーム」では effect 未実行のため viewProgress がまだ 1 で「移動後」が描画される。
  // そのフレームでは lastLayoutTransformRef が前セグメントのままなので、ここを表示して一瞬の「移動後」表示を防ぐ。
  const prevNodeIdsForView = lastFocusNodeIdsRef.current;
  const prevEdgeIdsForView = lastFocusEdgeIdsRef.current;
  const focusUnchangedForView =
    prevNodeIdsForView.length === focusNodeIds.length &&
    prevNodeIdsForView.every((id, i) => id === focusNodeIds[i]) &&
    prevEdgeIdsForView.length === focusEdgeIds.length &&
    prevEdgeIdsForView.every((id, i) => id === focusEdgeIds[i]);
  const focusJustChanged = !focusUnchangedForView;
  const displayScale = focusJustChanged
    ? lastLayoutTransformRef.current.scale
    : interpolatedScale;
  const displayCenterX = focusJustChanged
    ? lastLayoutTransformRef.current.centerX
    : interpolatedCenterX;
  const displayCenterY = focusJustChanged
    ? lastLayoutTransformRef.current.centerY
    : interpolatedCenterY;

  /** スケールに比例したノード半径（最小2で clamp） */
  const nodeRadius = Math.max(2, NODE_RADIUS * displayScale);
  const toView = useCallback(
    (x: number, y: number) =>
      [
        width / 2 + (x - displayCenterX) * displayScale,
        height / 2 + (y - displayCenterY) * displayScale,
      ] as const,
    [width, height, displayCenterX, displayCenterY, displayScale],
  );

  if (!baseGraph || baseGraph.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg text-slate-400 text-sm"
        style={{ width, height }}
      >
        このセグメントにはグラフがありません
      </div>
    );
  }

  const graphContent = (
    <g>
      {links.map((link, i) => {
        const source = link.source as CustomNodeType;
        const target = link.target as CustomNodeType;
        if (
          source.x == null ||
          source.y == null ||
          target.x == null ||
          target.y == null
        ) {
          return null;
        }
        const [sx, sy] = toView(source.x, source.y);
        const [tx, ty] = toView(target.x, target.y);
        const key = getEdgeCompositeKeyFromLink(link);
        const pathD = `M ${sx} ${sy} L ${tx} ${ty}`;
        const isFocusEdge = focusEdgeIdSet.has(key);
        const dx = tx - sx;
        const dy = ty - sy;
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        else if (angle < -90) angle += 180;
        const labelX = (sx + tx) / 2;
        const labelY = (sy + ty) / 2;
        const labelTransform = `rotate(${angle}, ${labelX}, ${labelY})`;

        const edgeProgress = fadeProgress < 1 ? fadeProgress : effectiveProgress;

        if (hasExplicitEdges && isFocusEdge) {
          return (
            <g key={`${key}-${i}`}>
              <path
                d={pathD}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={2}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - edgeProgress}
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
                  opacity={Math.max(0, Math.min(1, edgeProgress * 2 - 0.5))}
                >
                  {link.type}
                </text>
              )}
            </g>
          );
        }
        const sourceNode = link.source as CustomNodeType;
        const targetNode = link.target as CustomNodeType;
        const isNeighborEdge =
          neighborNodeIdSet.has(sourceNode.id) ||
          neighborNodeIdSet.has(targetNode.id);
        const edgeOpacity = isNeighborEdge
          ? NEIGHBOR_EDGE_OPACITY
          : DIM_EDGE_OPACITY;
        return (
          <g key={`${key}-${i}`}>
            <path
              d={pathD}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeOpacity={edgeOpacity}
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
                style={{ opacity: edgeOpacity }}
                opacity={edgeProgress}
              >
                {link.type}
              </text>
            )}
          </g>
        );
      })}
      {nodes.map((node) => {
        if (node.x == null || node.y == null) return null;
        const [vx, vy] = toView(node.x, node.y);
        const opacity = getNodeOpacity(node);
        return (
          <g
            key={node.id}
            transform={`translate(${vx}, ${vy})`}
            style={{ opacity }}
          >
            <circle
              r={nodeRadius}
              fill="#e2e8f0"
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
            <text
              y={nodeRadius + 14}
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
  );

  const graphInner = freeExploreMode ? (
    <D3ZoomProvider
      svgRef={svgRef}
      currentScale={zoomScale}
      setCurrentScale={setZoomScale}
      currentTransformX={zoomX}
      setCurrentTransformX={setZoomX}
      currentTransformY={zoomY}
      setCurrentTransformY={setZoomY}
    >
      {graphContent}
    </D3ZoomProvider>
  ) : (
    graphContent
  );

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-hidden"
      style={{ maxWidth: "100%", height: "auto" }}
    >
      {showBottomFadeGradient && (
        <defs>
          <linearGradient
            id="storytelling-bottom-fade-mask-gradient"
            x1={0}
            y1={height - 96}
            x2={0}
            y2={height}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset={0} stopColor="white" />
            <stop offset={1} stopColor="black" />
          </linearGradient>
          <mask id="storytelling-bottom-fade-mask">
            <rect x={0} y={0} width={width} height={height} fill="white" />
            <rect
              x={0}
              y={height - 96}
              width={width}
              height={96}
              fill="url(#storytelling-bottom-fade-mask-gradient)"
            />
          </mask>
        </defs>
      )}
      {showBottomFadeGradient ? (
        <g mask="url(#storytelling-bottom-fade-mask)">{graphInner}</g>
      ) : (
        graphInner
      )}
    </svg>
  );
});
