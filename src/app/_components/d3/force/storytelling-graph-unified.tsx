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
  forceX,
  forceY,
  forceCollide,
} from "d3";
import { select } from "d3";
import type { Simulation } from "d3";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { filterGraphByLayoutInstruction } from "@/app/_utils/kg/filter-graph-by-layout-instruction";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";
import { D3ZoomProvider } from "../zoom";

const NODE_RADIUS = 3;
const LINK_DISTANCE = 80;
/** フォーカスが1点のとき scale が暴れないよう cap する */
const MAX_VIEW_SCALE = 3;
const FOCUS_NODE_OPACITY = 1;
const NEIGHBOR_NODE_OPACITY = 0.15;
/** フォーカス・隣接以外のノードをほんのり表示する不透明度 */
const DIM_NODE_OPACITY = 0.05;
const FOCUS_EDGE_OPACITY = 1;
const NEIGHBOR_EDGE_OPACITY = 0.15;
/** フォーカス・隣接以外のエッジをほんのり表示する不透明度 */
const DIM_EDGE_OPACITY = 0.05;

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
  isPc = false,
  communityMap,
  narrativeFlow,
  showFullGraph = false,
}: {
  graphDocument: GraphDocumentForFrontend;
  focusNodeIds: string[];
  focusEdgeIds: string[];
  animationProgress: number;
  width: number;
  height: number;
  filter?: LayoutInstruction["filter"];
  freeExploreMode?: boolean;
  /** 親で判定したPC/SP。padding・端グラデーションなどに使用 */
  isPc?: boolean;
  /** ノードID→コミュニティID。指定時はコミュニティごとY軸ジグザク配置 */
  communityMap?: Record<string, string>;
  /** ストーリー順（order 順にY軸配置、X軸は左右ジグザク） */
  narrativeFlow?: Array<{ communityId: string; order: number }>;
  /** オーバービュー時など、グラフ全体を表示。内部の baseGraph の全ノード・全エッジでフォーカスする */
  showFullGraph?: boolean;
}) {
  const showBottomFadeGradient = !isPc;
  const edgeFadePx = isPc ? 64 : undefined;
  const useCommunityLayout =
    communityMap != null &&
    narrativeFlow != null &&
    (narrativeFlow?.some((n) => n.order != null) ?? false);
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

  const effectiveFocusNodeIds = useMemo(
    () =>
      showFullGraph ? initNodes.map((n) => n.id) : focusNodeIds,
    [showFullGraph, focusNodeIds, initNodes],
  );
  const effectiveFocusEdgeIds = useMemo(
    () =>
      showFullGraph
        ? initLinks.map((l) => getEdgeCompositeKeyFromLink(l))
        : focusEdgeIds,
    [showFullGraph, focusEdgeIds, initLinks],
  );

  const focusNodeIdSet = useMemo(
    () => new Set(effectiveFocusNodeIds),
    [effectiveFocusNodeIds],
  );
  const focusEdgeIdSet = useMemo(
    () => new Set(effectiveFocusEdgeIds),
    [effectiveFocusEdgeIds],
  );
  const hasExplicitEdges = effectiveFocusEdgeIds.length > 0;

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

    const allNodes = initNodes.map((n) => ({
      ...n,
      x: n.x ?? width / 2 + (Math.random() - 0.5) * 100,
      y: n.y ?? height / 2 + (Math.random() - 0.5) * 100,
    })) as CustomNodeType[];

    // リンクの source/target を allNodes の参照に揃える（描画時に x,y が一致するように）
    const allLinks = initLinks.map((link) => {
      const src = link.source as CustomNodeType;
      const tgt = link.target as CustomNodeType;
      const sourceNode = allNodes.find((n) => n.id === src.id) ?? allNodes[0];
      const targetNode = allNodes.find((n) => n.id === tgt.id) ?? allNodes[0];
      return { ...link, source: sourceNode, target: targetNode } as CustomLinkType;
    });

    if (useCommunityLayout && communityMap && narrativeFlow) {
      // コミュニティごとにY軸順・X軸ジグザク配置（print-generative-layout-graph の horizontal 相当）
      const communityGroups = new Map<string, CustomNodeType[]>();
      allNodes.forEach((node) => {
        const cid = communityMap[node.id];
        if (cid) {
          if (!communityGroups.has(cid)) communityGroups.set(cid, []);
          communityGroups.get(cid)!.push(node);
        }
      });

      const communityTargetPositions = new Map<string, { x: number; y: number }>();
      const sortedStoryCommunities = Array.from(communityGroups.entries())
        .map(([communityId, nodes]) => {
          const flow = narrativeFlow.find((n) => n.communityId === communityId);
          return {
            communityId,
            nodes,
            order: flow?.order,
            size: nodes.length,
          };
        })
        .filter((item) => item.order !== undefined)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const baseSpacing = height;
      const minSpacing = height;
      const maxSpacing = height * 5;
      let currentPrimary = height * 0.5;
      const storyCommunityYPositions: number[] = [];

      sortedStoryCommunities.forEach((item, index) => {
        const { communityId, nodes, order } = item;
        if (order === undefined) return;
        const communitySize = nodes.length;
        const currentRadius = Math.sqrt(communitySize);

        if (index > 0) {
          const prevItem = sortedStoryCommunities[index - 1]!;
          const prevSize = prevItem.size;
          const prevNormalizedSize = Math.sqrt(prevSize / 10);
          const prevSpacing = Math.min(
            maxSpacing,
            Math.max(minSpacing, baseSpacing + prevNormalizedSize * 0.3 * height),
          );
          const prevRadius = Math.sqrt(prevSize);
          const prevPrimary =
            communityTargetPositions.get(prevItem.communityId)?.y ?? currentPrimary;
          currentPrimary = prevPrimary + prevRadius + prevSpacing / 4 + currentRadius;
        }

        const targetPrimary = currentPrimary;
        storyCommunityYPositions.push(targetPrimary);
        const isLeft = order % 2 === 1;
        const leftX = width * 0.2;
        const rightX = width * 0.8;
        const targetX = isLeft ? leftX : rightX;
        communityTargetPositions.set(communityId, { x: targetX, y: targetPrimary });
      });

      const nonStoryCommunities = Array.from(communityGroups.entries()).filter(
        ([cid]) => !narrativeFlow.some((n) => n.communityId === cid && n.order != null),
      );
      const minStoryPrimary =
        storyCommunityYPositions.length > 0
          ? Math.min(...storyCommunityYPositions)
          : height * 0.5;
      const maxStoryPrimary =
        storyCommunityYPositions.length > 0
          ? Math.max(...storyCommunityYPositions)
          : height * 2.5;
      const storyPrimaryRange =
        maxStoryPrimary - minStoryPrimary || height * 2;
      nonStoryCommunities.forEach(([communityId], index) => {
        const normalizedIndex =
          nonStoryCommunities.length > 1 ? index / (nonStoryCommunities.length - 1) : 0.5;
        const targetPrimary = minStoryPrimary + normalizedIndex * storyPrimaryRange;
        const isLeft = index % 2 === 0;
        const targetX = isLeft ? width * 0.1 : width * 1.4;
        communityTargetPositions.set(communityId, { x: targetX, y: targetPrimary });
      });

      communityGroups.forEach((nodes, communityId) => {
        if (!communityTargetPositions.has(communityId)) {
          const centerX =
            nodes.reduce((s, n) => s + (n.x ?? width / 2), 0) / nodes.length;
          const centerY =
            nodes.reduce((s, n) => s + (n.y ?? height / 2), 0) / nodes.length;
          communityTargetPositions.set(communityId, { x: centerX, y: centerY });
        }
      });

      const simulation = forceSimulation<CustomNodeType, CustomLinkType>(allNodes)
        .force(
          "link",
          forceLink<CustomNodeType, CustomLinkType>(allLinks)
            .id((d) => d.id)
            .distance(30)
            .strength((link) => {
              const source = link.source as CustomNodeType;
              const target = link.target as CustomNodeType;
              const srcC = communityMap[source.id];
              const tgtC = communityMap[target.id];
              if (srcC && tgtC && srcC !== tgtC) return 0.01;
              return 0.2;
            }),
        )
        .force("charge", forceManyBody().strength(-200))
        .force("collide", forceCollide(20))
        .force("center", forceCenter(width / 2, height / 2).strength(0.05))
        .force(
          "y",
          forceY<CustomNodeType>((d) => {
            const cid = communityMap[d.id];
            if (!cid) return height / 2;
            const pos = communityTargetPositions.get(cid);
            return pos ? pos.y : height / 2;
          }).strength((d) => (communityMap[d.id] ? 0.15 : 0.0001)),
        )
        .force(
          "x",
          forceX<CustomNodeType>((d) => {
            const cid = communityMap[d.id];
            if (!cid) return width / 2;
            const pos = communityTargetPositions.get(cid);
            return pos ? pos.x : width / 2;
          }).strength((d) => (communityMap[d.id] ? 0.15 : 0.0001)),
        );

      simulation.alpha(1).restart();
      let iterations = 0;
      const maxIterations = 2000;
      while (simulation.alpha() > 0.001 && iterations < maxIterations) {
        simulation.tick();
        iterations++;
      }
      simulation.stop();

      setNodes([...simulation.nodes()]);
      setLinks(allLinks);
      simulationRef.current = simulation;
      return () => {
        simulation.stop();
      };
    }

    const simulation = forceSimulation<CustomNodeType, CustomLinkType>(allNodes)
      .force(
        "link",
        forceLink<CustomNodeType, CustomLinkType>(allLinks)
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
    setLinks(allLinks);
    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [
    initNodes,
    initLinks,
    width,
    height,
    useCommunityLayout,
    communityMap,
    narrativeFlow,
  ]);

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
    effectiveFocusNodeIds.forEach((id) => set.add(id));
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
  }, [effectiveFocusNodeIds, sourceNodeIdsOfFocusEdges, targetNodeIdsOfFocusEdges, links]);

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

  // ビューはフォーカス部分グラフを中心とした局所範囲だけを viewBox に表示。
  // communityMap がある場合は、viewBox の範囲をコミュニティに属するノード・エッジに限定する（非コミュニティが描画領域を広げないように）。
  const layoutTransform = useMemo(() => {
    if (!nodes.length) return { scale: 1, centerX: 0, centerY: 0 };
    const focusIds = new Set(effectiveFocusNodeIds);
    links.forEach((link) => {
      const key = getEdgeCompositeKeyFromLink(link);
      if (focusEdgeIdSet.has(key)) {
        const src = link.source as CustomNodeType;
        const tgt = link.target as CustomNodeType;
        focusIds.add(src.id);
        focusIds.add(tgt.id);
      }
    });
    if (communityMap != null) {
      const communityOnly = new Set<string>();
      focusIds.forEach((id) => {
        if (communityMap[id] != null) communityOnly.add(id);
      });
      focusIds.clear();
      communityOnly.forEach((id) => focusIds.add(id));
    }
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
    if (minX === Infinity) return { scale: 0.75, centerX: 0, centerY: 0 };
    const paddingX = isPc ? 64 : 32;
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
  }, [nodes, width, height, effectiveFocusNodeIds, focusEdgeIdSet, links, isPc, communityMap]);

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

  /** ノード半径（generative-layout-graph と同様: neighborLinkCount で変化させ、displayScale で画面サイズに合わせる） */
  const getNodeRadius = useCallback(
    (node: CustomNodeType) => {
      const baseRadiusLayout =
        1.6 * ((node.neighborLinkCount ?? 0) * 0.1 + 3.6);
      return Math.max(1.5, Math.min(22, baseRadiusLayout * displayScale));
    },
    [displayScale],
  );
  /** ノードラベルを表示する閾値（generative-layout-graph と同様、引きで表示する時は非表示） */
  const showNodeLabels = displayScale > 0.7;
  /** スケールに応じたノードラベルフォントサイズ（引きで小さく、寄りで読みやすく） */
  const nodeLabelFontSize = showNodeLabels
    ? (displayScale > 4 ? 3 : 6) * 1.5
    : 0;
  /** エッジラベルを表示する閾値（generative では currentScale > 1.4） */
  const showEdgeLabels = displayScale > 1.4;
  /** スケールに応じたエッジ・ノードの線の太さ（引きで細く、寄りで見やすく） */
  const edgeStrokeWidthFocus = Math.max(0.4, Math.min(2.5, 2 * displayScale));
  const edgeStrokeWidthNormal = Math.max(0.3, Math.min(1.5, 1.5 * displayScale));
  const nodeStrokeWidth = Math.max(0.25, Math.min(1.5, 1.5 * displayScale));
  const toView = useCallback(
    (x: number, y: number) =>
      [
        width / 2 + (x - displayCenterX) * displayScale,
        height / 2 + (y - displayCenterY) * displayScale,
      ] as const,
    [width, height, displayCenterX, displayCenterY, displayScale],
  );

  const nodesToRender = useMemo(
    () =>
      communityMap != null
        ? nodes.filter((n) => communityMap[n.id] != null)
        : nodes,
    [nodes, communityMap],
  );
  const linksToRender = useMemo(
    () =>
      communityMap != null
        ? links.filter((link) => {
          const src = link.source as CustomNodeType;
          const tgt = link.target as CustomNodeType;
          return communityMap[src.id] != null && communityMap[tgt.id] != null;
        })
        : links,
    [links, communityMap],
  );

  /** グラフ全体表示時用: エッジ長（レイアウト座標）の min/max/range（generative と同様の距離ベース透明度に使用） */
  const linkDistanceRange = useMemo(() => {
    const distances = linksToRender
      .map((link) => {
        const src = link.source as CustomNodeType;
        const tgt = link.target as CustomNodeType;
        if (
          src.x == null ||
          src.y == null ||
          tgt.x == null ||
          tgt.y == null
        )
          return null;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        return Math.sqrt(dx * dx + dy * dy);
      })
      .filter((d): d is number => d !== null);
    if (distances.length === 0)
      return { minDistance: 0, maxDistance: 1, distanceRange: 1 };
    const minDistance = Math.min(...distances);
    const maxDistance = Math.max(...distances);
    return {
      minDistance,
      maxDistance,
      distanceRange: maxDistance - minDistance || 1,
    };
  }, [linksToRender]);

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
      {linksToRender.map((link, i) => {
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
          const focusStrokeOpacity =
            showFullGraph
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
              : FOCUS_EDGE_OPACITY;
          return (
            <g key={`${key}-${i}`}>
              <path
                d={pathD}
                fill="none"
                stroke="#94a3b8"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - edgeProgress}
                strokeLinecap="round"
                strokeOpacity={focusStrokeOpacity}
                strokeWidth={edgeStrokeWidthFocus}
              />
              {link.type && showEdgeLabels && (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={5}
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
        const baseEdgeOpacity = isNeighborEdge
          ? NEIGHBOR_EDGE_OPACITY
          : DIM_EDGE_OPACITY;
        const edgeOpacity =
          showFullGraph
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
          <g key={`${key}-${i}`}>
            <path
              d={pathD}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={edgeStrokeWidthNormal}
              strokeOpacity={edgeOpacity}
            />
            {link.type && showEdgeLabels && (
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={5}
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
      {nodesToRender.map((node) => {
        if (node.x == null || node.y == null) return null;
        const [vx, vy] = toView(node.x, node.y);
        const opacity = getNodeOpacity(node);
        const r = getNodeRadius(node) * (0.8 / Math.max(1, displayScale));
        return (
          <g
            key={node.id}
            transform={`translate(${vx}, ${vy})`}
            style={{ opacity }}
          >
            <circle
              r={r}
              fill="#e2e8f0"
              stroke="#94a3b8"
              strokeWidth={nodeStrokeWidth}
            />
            {showNodeLabels && nodeLabelFontSize > 0 && (
              <text
                y={-10}
                textAnchor="middle"
                fill="#e2e8f0"
                fontSize={nodeLabelFontSize}
                fontWeight="normal"
                className="pointer-events-none select-none"
              >
                {node.name}
              </text>
            )}
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
      {(showBottomFadeGradient || edgeFadePx != null) && (
        <defs>
          {edgeFadePx != null ? (
            <>
              <linearGradient
                id="storytelling-edge-fade-top"
                x1={0}
                y1={0}
                x2={0}
                y2={edgeFadePx}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset={0} stopColor="black" />
                <stop offset={1} stopColor="white" />
              </linearGradient>
              <linearGradient
                id="storytelling-edge-fade-bottom"
                x1={0}
                y1={height}
                x2={0}
                y2={height - edgeFadePx}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset={0} stopColor="black" />
                <stop offset={1} stopColor="white" />
              </linearGradient>
              <linearGradient
                id="storytelling-edge-fade-left"
                x1={0}
                y1={0}
                x2={edgeFadePx}
                y2={0}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset={0} stopColor="black" />
                <stop offset={1} stopColor="white" />
              </linearGradient>
              <linearGradient
                id="storytelling-edge-fade-right"
                x1={width}
                y1={0}
                x2={width - edgeFadePx}
                y2={0}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset={0} stopColor="black" />
                <stop offset={1} stopColor="white" />
              </linearGradient>
              <mask id="storytelling-edge-fade-mask">
                <rect x={0} y={0} width={width} height={height} fill="white" />
                <rect
                  x={0}
                  y={0}
                  width={width}
                  height={edgeFadePx}
                  fill="url(#storytelling-edge-fade-top)"
                />
                <rect
                  x={0}
                  y={height - edgeFadePx}
                  width={width}
                  height={edgeFadePx}
                  fill="url(#storytelling-edge-fade-bottom)"
                />
                <rect
                  x={0}
                  y={0}
                  width={edgeFadePx}
                  height={height}
                  fill="url(#storytelling-edge-fade-left)"
                />
                <rect
                  x={width - edgeFadePx}
                  y={0}
                  width={edgeFadePx}
                  height={height}
                  fill="url(#storytelling-edge-fade-right)"
                />
              </mask>
            </>
          ) : (
            <>
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
            </>
          )}
        </defs>
      )}
      {edgeFadePx != null ? (
        <g mask="url(#storytelling-edge-fade-mask)">{graphInner}</g>
      ) : showBottomFadeGradient ? (
        <g mask="url(#storytelling-bottom-fade-mask)">{graphInner}</g>
      ) : (
        graphInner
      )}
    </svg>
  );
});
