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
import {
  easeInOutCubic,
  easeOutCubic,
  estimateLabelMarginLayout,
  estimateNodeLabelFontSizeFromScale,
  getDirectionalKey,
  getNodePairKey,
  isCustomNodeType,
  isLineSegmentInViewport,
} from "./storytelling-graph/utils/graph-utils";
import { FOCUS_TRANSITION_MS, useTransitionProgress } from "./storytelling-graph/hooks/use-transition-progress";
import { useSteadyAnimation } from "./storytelling-graph/hooks/use-steady-animation";
import { StoryGraphViewportLayer } from "./storytelling-graph/components/story-graph-viewport-layer";
import { StoryGraphSvgFrame } from "./storytelling-graph/components/story-graph-svg-frame";
import { StoryGraphContent } from "./storytelling-graph/components/story-graph-content";

// 既存呼び出し側との互換性維持用に再エクスポート
export { easeOutCubic } from "./storytelling-graph/utils/graph-utils";

const NODE_RADIUS = 3;
const LINK_DISTANCE = 80;
/** フォーカスが1点のとき scale が暴れないよう cap する */
const MAX_VIEW_SCALE = 3;
/** レイアウト計算用の固定サイズ。冒頭・セグメントで同一シミュレーション結果を使い回すため、実ビューサイズに依存しない */
const REF_LAYOUT_WIDTH = 800;
const REF_LAYOUT_HEIGHT = 600;
const FOCUS_NODE_OPACITY = 1;
const NEIGHBOR_NODE_OPACITY = 0.15;
/** フォーカス・隣接以外のノードをほんのり表示する不透明度 */
const DIM_NODE_OPACITY = 0.05;
const FOCUS_EDGE_OPACITY = 1;
const NEIGHBOR_EDGE_OPACITY = 0.15;
/** フォーカス・隣接以外のエッジをほんのり表示する不透明度 */
const DIM_EDGE_OPACITY = 0.05;

/** 探索モード用: フォーカス・隣接以外のノードの不透明度（通常モードより差を小さく） */
const EXPLORE_DIM_NODE_OPACITY = 0.4;
/** 探索モード用: 隣接ノードの不透明度 */
const EXPLORE_NEIGHBOR_NODE_OPACITY = 0.8;
/** 探索モード用: フォーカス・隣接以外のエッジの不透明度 */
const EXPLORE_DIM_EDGE_OPACITY = 0.4;
/** 探索モード用: 隣接エッジの不透明度 */
const EXPLORE_NEIGHBOR_EDGE_OPACITY = 0.8;
/** 探索モード用: 入室セグメントに依存しないラベル・ノードサイズの基準スケール */
const EXPLORE_BASE_SCALE = 1.2;

/** ビューポートカリング: 拡張ビューポートのマージン（px） */
const CULLING_VIEWPORT_MARGIN = 80;
/** ビューポートカリング: このノード数以上でカリングを有効化 */
const CULLING_THRESHOLD = 120;


/** 出る側ノードのフェードイン完了までに使う progress の割合 (0–1) */
const SOURCE_FADE_END = 0.35;
/** 入る側ノードのフェードイン開始となる progress の閾値 */
const TARGET_FADE_START = 0.55;
/** 入る側ノードのフェードインに要する progress の幅 */
const TARGET_FADE_DURATION = 0.35;


export const StorytellingGraphUnified = memo(function StorytellingGraphUnified({
  graphDocument,
  focusNodeIds,
  focusEdgeIds,
  animationProgress,
  segmentProgress,
  scrollProgressStepIndex,
  scrollCurrentStepIndex,
  width,
  height,
  filter,
  segmentNodeIds,
  freeExploreMode = false,
  isPc = false,
  communityMap,
  narrativeFlow,
  showFullGraph = false,
  /** セグメントに特定の nodeIds/edgeIds がある（コミュニティ全体表示でない） */
  hasSpecificSegmentFocus = true,
  communityTitles,
  onCommunityTitleClick,
  onTransitionComplete,
  onSvgRef,
  forRecording = false,
}: {
  graphDocument: GraphDocumentForFrontend;
  focusNodeIds: string[];
  focusEdgeIds: string[];
  animationProgress: number;
  /** セグメント進入後のフェード・線描画の progress（0–1）。渡されているときはノード・エッジをこの値で描画する */
  segmentProgress?: number;
  scrollProgressStepIndex?: number;
  scrollCurrentStepIndex?: number;
  width: number;
  height: number;
  filter?: LayoutInstruction["filter"];
  /** セグメントで参照されているノードID（includeSegmentNodes が true のときにフィルタ結果に追加） */
  segmentNodeIds?: string[];
  freeExploreMode?: boolean;
  /** 親で判定したPC/SP。padding・端グラデーションなどに使用 */
  isPc?: boolean;
  /** ノードID→コミュニティID。指定時はコミュニティごとY軸ジグザク配置 */
  communityMap?: Record<string, string>;
  /** ストーリー順（order 順にY軸配置、X軸は左右ジグザク） */
  narrativeFlow?: Array<{ communityId: string; order: number }>;
  /** オーバービュー時など、グラフ全体を表示。内部の baseGraph の全ノード・全エッジでフォーカスする */
  showFullGraph?: boolean;
  /** セグメントに特定の nodeIds/edgeIds がある（false のときはコミュニティ全体表示で persistent 判定の ref を更新しない） */
  hasSpecificSegmentFocus?: boolean;
  /** コミュニティID → タイトル。showFullGraph 時にコミュニティ円とタイトル表示に使用（print-generative-layout-graph に倣う） */
  communityTitles?: Record<string, string>;
  /** コミュニティタイトルクリック時。そのコミュニティの先頭セグメントへ遷移するために使用 */
  onCommunityTitleClick?: (communityId: string) => void;
  /** フォーカス遷移アニメーションが完了したときに呼ばれるコールバック */
  onTransitionComplete?: () => void;
  /** 外部から SVG 要素にアクセスするためのコールバック ref */
  onSvgRef?: (el: SVGSVGElement | null) => void;
  /** 録画時など、ビューパディングを 0 にしてグラフを最大表示する */
  forRecording?: boolean;
}) {
  const showBottomFadeGradient = !isPc;
  // PC版のフェードは親コンテナ（CSS Overlay）で行うため、ここでは SVG Mask を生成しない（描画負荷軽減）
  const edgeFadePx = undefined;
  const useCommunityLayout =
    communityMap != null &&
    narrativeFlow != null &&
    (narrativeFlow?.some((n) => n.order != null) ?? false);
  const svgRef = useRef<SVGSVGElement>(null);
  // 外部から SVG 要素にアクセスできるよう ref をコールバックで通知
  const onSvgRefStable = useRef(onSvgRef);
  onSvgRefStable.current = onSvgRef;
  useEffect(() => {
    onSvgRefStable.current?.(svgRef.current);
    return () => onSvgRefStable.current?.(null);
  }, []);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomX, setZoomX] = useState(0);
  const [zoomY, setZoomY] = useState(0);
  const [failedImageNodeIds, setFailedImageNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragStartRef = useRef<{
    nodeId: string;
    startNodeX: number;
    startNodeY: number;
    startPointerLayoutX: number;
    startPointerLayoutY: number;
  } | null>(null);
  const nodesRef = useRef<CustomNodeType[]>([]);
  const clientToLayoutRef = useRef<((cx: number, cy: number) => { x: number; y: number } | null) | null>(null);
  /** RAF から参照するため、最新の fadeProgress を ref に保持 */
  const fadeProgressRef = useRef(0);
  /** ステップが変わった直後の 1 回は displayProgress を 0 にして前ステップの描画フラッシュを防ぐ */
  const prevScrollCurrentStepIndexRef = useRef<number | "unset">("unset");
  /** 前セグメントの effectiveFocus（フォーカス＋エッジ端点のみ。隣接ノードは含まない）。
   * フェードインスキップ用。隣接のみだったノードを除外することで、新規エッジ端点のフェードインと
   * 前セグメントフォーカスの再フェード防止の両立を実現。 */
  const lastEffectiveFocusNodeIdsRef = useRef<Set<string>>(new Set());
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
      return filterGraphByLayoutInstruction(graphDocument, filter, {
        segmentNodeIds: segmentNodeIds?.length ? segmentNodeIds : undefined,
      });
    }
    return graphDocument;
  }, [graphDocument, filter, segmentNodeIds]);

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
    return baseGraph.relationships
      .map((rel) => {
        const source = getNodeByIdForFrontend(rel.sourceId, initNodes);
        const target = getNodeByIdForFrontend(rel.targetId, initNodes);
        if (!source || !target) {
          console.warn("[StorytellingGraphUnified] initLinks: 存在しないノードへの参照を除外", {
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
  }, [baseGraph?.relationships, initNodes]);

  /** フォーカスノード＋フォーカスエッジの両端ノード（エッジのみ指定時も端点をハイライト） */
  const effectiveFocusNodeIds = useMemo(() => {
    if (showFullGraph) return initNodes.map((n) => n.id);
    const set = new Set<string>(focusNodeIds);
    const focusEdgeSet = new Set(focusEdgeIds);
    initLinks.forEach((link) => {
      const key = getEdgeCompositeKeyFromLink(link);
      if (focusEdgeSet.has(key)) {
        const src = link.source as CustomNodeType;
        const tgt = link.target as CustomNodeType;
        set.add(src.id);
        set.add(tgt.id);
      }
    });
    return Array.from(set);
  }, [showFullGraph, focusNodeIds, focusEdgeIds, initNodes, initLinks]);

  /** フォーカスエッジ＋effectiveFocusNodeIds のノード間を結ぶエッジ（ノードのみ指定時もその間のエッジをハイライト） */
  const effectiveFocusEdgeIds = useMemo(() => {
    if (showFullGraph) {
      return initLinks.map((l) => getEdgeCompositeKeyFromLink(l));
    }
    const edgeSet = new Set<string>(focusEdgeIds);
    const focusNodeSet = new Set(effectiveFocusNodeIds);
    initLinks.forEach((link) => {
      const src = (link.source as CustomNodeType).id;
      const tgt = (link.target as CustomNodeType).id;
      if (focusNodeSet.has(src) && focusNodeSet.has(tgt)) {
        edgeSet.add(getEdgeCompositeKeyFromLink(link));
      }
    });
    return Array.from(edgeSet);
  }, [showFullGraph, focusEdgeIds, initLinks, effectiveFocusNodeIds]);

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
  const lastShowFullGraphRef = useRef(showFullGraph);
  const [transitionFromNodeIds, setTransitionFromNodeIds] = useState<string[]>(focusNodeIds);
  /** 遷移開始からの経過 ms。遷移中でないときは FOCUS_TRANSITION_MS 以上にして viewProgress/fadeProgress を 1 にする */
  const [transitionElapsedMs, setTransitionElapsedMs] = useState(FOCUS_TRANSITION_MS);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const prevNodeIds = lastFocusNodeIdsRef.current;
    const prevEdgeIds = lastFocusEdgeIdsRef.current;
    const prevShowFullGraph = lastShowFullGraphRef.current;
    const nodeIdsEqual =
      prevNodeIds.length === focusNodeIds.length &&
      prevNodeIds.every((id, i) => id === focusNodeIds[i]);
    const edgeIdsEqual =
      prevEdgeIds.length === focusEdgeIds.length &&
      prevEdgeIds.every((id, i) => id === focusEdgeIds[i]);
    const showFullGraphUnchanged = prevShowFullGraph === showFullGraph;

    if (nodeIdsEqual && edgeIdsEqual && showFullGraphUnchanged) {
      return;
    }

    setTransitionFromLayoutTransform(lastLayoutTransformRef.current);
    setTransitionFromNodeIds(prevNodeIds);
    lastFocusNodeIdsRef.current = focusNodeIds;
    lastFocusEdgeIdsRef.current = focusEdgeIds;
    lastShowFullGraphRef.current = showFullGraph;
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
  }, [focusNodeIds, focusEdgeIds, showFullGraph]);

  const { isTransitionComplete, viewProgress, fadeProgress } =
    useTransitionProgress(transitionElapsedMs);

  // 遷移完了時に親へ通知（録画シーケンサーが遷移完了を検知するために使用）
  const onTransitionCompleteRef = useRef(onTransitionComplete);
  onTransitionCompleteRef.current = onTransitionComplete;
  const prevTransitionCompleteRef = useRef(isTransitionComplete);
  useEffect(() => {
    // false → true に変わった瞬間のみコールバックを呼ぶ
    if (isTransitionComplete && !prevTransitionCompleteRef.current) {
      onTransitionCompleteRef.current?.();
    }
    prevTransitionCompleteRef.current = isTransitionComplete;
  }, [isTransitionComplete]);

  const { shouldRunSteadyAnim, nodePulseScale, edgeFlowStops } =
    useSteadyAnimation({
      isTransitionComplete,
      freeExploreMode,
      showFullGraph,
    });

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

  useEffect(() => {
    if (!initNodes.length) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const allNodes = initNodes.map((n) => ({
      ...n,
      x: n.x ?? REF_LAYOUT_WIDTH / 2 + (Math.random() - 0.5) * 100,
      y: n.y ?? REF_LAYOUT_HEIGHT / 2 + (Math.random() - 0.5) * 100,
    })) as CustomNodeType[];

    // リンクの source/target を allNodes の参照に揃える（描画時に x,y が一致するように）
    const allLinks = initLinks
      .map((link) => {
        const src = link.source;
        const tgt = link.target;
        if (!isCustomNodeType(src) || !isCustomNodeType(tgt)) {
          console.warn("[StorytellingGraphUnified] allLinks: source/target が undefined", {
            linkId: link.id,
            sourceId: isCustomNodeType(src) ? src.id : "(undefined)",
            targetId: isCustomNodeType(tgt) ? tgt.id : "(undefined)",
          });
          return null;
        }
        const sourceNode = allNodes.find((n) => n.id === src.id);
        const targetNode = allNodes.find((n) => n.id === tgt.id);
        if (!sourceNode || !targetNode) {
          console.warn("[StorytellingGraphUnified] allLinks: 参照先ノードが存在しない", {
            linkId: link.id,
            sourceId: src.id,
            targetId: tgt.id,
            missingSourceNode: !sourceNode,
            missingTargetNode: !targetNode,
          });
          return null;
        }
        return { ...link, source: sourceNode, target: targetNode };
      })
      .filter((link): link is NonNullable<typeof link> => link != null) as CustomLinkType[];

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
            Math.max(minSpacing, baseSpacing + prevNormalizedSize * 0.3 * REF_LAYOUT_HEIGHT),
          );
          const prevRadius = Math.sqrt(prevSize);
          const prevPrimary =
            communityTargetPositions.get(prevItem.communityId)?.y ?? currentPrimary;
          currentPrimary = prevPrimary + prevRadius + prevSpacing / 4 + currentRadius;
        }

        const targetPrimary = currentPrimary;
        storyCommunityYPositions.push(targetPrimary);
        const isLeft = order % 2 === 1;
        const leftX = REF_LAYOUT_WIDTH * 0.2;
        const rightX = REF_LAYOUT_WIDTH * 0.8;
        const targetX = isLeft ? leftX : rightX;
        communityTargetPositions.set(communityId, { x: targetX, y: targetPrimary });
      });

      const nonStoryCommunities = Array.from(communityGroups.entries()).filter(
        ([cid]) => !narrativeFlow.some((n) => n.communityId === cid && n.order != null),
      );
      const minStoryPrimary =
        storyCommunityYPositions.length > 0
          ? Math.min(...storyCommunityYPositions)
          : REF_LAYOUT_HEIGHT * 0.5;
      const maxStoryPrimary =
        storyCommunityYPositions.length > 0
          ? Math.max(...storyCommunityYPositions)
          : REF_LAYOUT_HEIGHT * 2.5;
      const storyPrimaryRange =
        maxStoryPrimary - minStoryPrimary || REF_LAYOUT_HEIGHT * 2;
      nonStoryCommunities.forEach(([communityId], index) => {
        const normalizedIndex =
          nonStoryCommunities.length > 1 ? index / (nonStoryCommunities.length - 1) : 0.5;
        const targetPrimary = minStoryPrimary + normalizedIndex * storyPrimaryRange;
        const isLeft = index % 2 === 0;
        const targetX = isLeft ? REF_LAYOUT_WIDTH * 0.1 : REF_LAYOUT_WIDTH * 1.4;
        communityTargetPositions.set(communityId, { x: targetX, y: targetPrimary });
      });

      communityGroups.forEach((nodes, communityId) => {
        if (!communityTargetPositions.has(communityId)) {
          const centerX =
            nodes.reduce((s, n) => s + (n.x ?? REF_LAYOUT_WIDTH / 2), 0) / nodes.length;
          const centerY =
            nodes.reduce((s, n) => s + (n.y ?? REF_LAYOUT_HEIGHT / 2), 0) / nodes.length;
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
        .force("collide", forceCollide(30))
        .force("center", forceCenter(REF_LAYOUT_WIDTH / 2, REF_LAYOUT_HEIGHT / 2).strength(0.05))
        .force(
          "y",
          forceY<CustomNodeType>((d) => {
            const cid = communityMap[d.id];
            if (!cid) return REF_LAYOUT_HEIGHT / 2;
            const pos = communityTargetPositions.get(cid);
            return pos ? pos.y : REF_LAYOUT_HEIGHT / 2;
          }).strength((d) => (communityMap[d.id] ? 0.15 : 0.0001)),
        )
        .force(
          "x",
          forceX<CustomNodeType>((d) => {
            const cid = communityMap[d.id];
            if (!cid) return REF_LAYOUT_WIDTH / 2;
            const pos = communityTargetPositions.get(cid);
            return pos ? pos.x : REF_LAYOUT_WIDTH / 2;
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
      .force("center", forceCenter(REF_LAYOUT_WIDTH / 2, REF_LAYOUT_HEIGHT / 2))
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
    useCommunityLayout,
    communityMap,
    narrativeFlow,
    height,
  ]);

  const progress = Math.max(0, Math.min(1, animationProgress * 2));
  /** 遷移完了後は親の progress が 0 から来ても二重アニメにしないため、常に max(progress, 1) を使う */
  const effectiveProgress =
    fadeProgress < 1 ? fadeProgress : Math.max(progress, 1);

  /** セグメント progress が渡されているときはそれでノード・エッジを描画し、そうでなければ effectiveProgress（フォーカス遷移・animationProgress）を使う */
  const segmentBranch =
    segmentProgress != null &&
    scrollProgressStepIndex != null &&
    scrollCurrentStepIndex != null;
  let stepJustChanged = false;
  if (segmentBranch) {
    if (prevScrollCurrentStepIndexRef.current === "unset") {
      prevScrollCurrentStepIndexRef.current = scrollCurrentStepIndex;
    } else {
      stepJustChanged = prevScrollCurrentStepIndexRef.current !== scrollCurrentStepIndex;
      prevScrollCurrentStepIndexRef.current = scrollCurrentStepIndex;
    }
  }
  const displayProgress = segmentBranch
    ? stepJustChanged
      ? 0
      : scrollProgressStepIndex === scrollCurrentStepIndex
        ? segmentProgress
        : scrollProgressStepIndex < scrollCurrentStepIndex
          ? 1
          : 0
    : effectiveProgress;

  fadeProgressRef.current = fadeProgress;

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

  /** フォーカス＋その1ホップ隣のノードID（フォーカスに直接エッジで繋がるノードのみ。それ以外は「ほんのり」表示） */
  const neighborNodeIdSet = useMemo(() => {
    const focusSet = new Set(effectiveFocusNodeIds);
    const set = new Set<string>(effectiveFocusNodeIds);
    links.forEach((link) => {
      const src = (link.source as CustomNodeType).id;
      const tgt = (link.target as CustomNodeType).id;
      if (focusSet.has(src)) set.add(tgt);
      if (focusSet.has(tgt)) set.add(src);
    });
    return set;
  }, [effectiveFocusNodeIds, links]);

  /** 前セグメントで effectiveFocus（フォーカス＋エッジ端点）だったノード＝フェードインをスキップ。
   * 隣接ノードのみだったものは含めないため、新規エッジ端点は正しくフェードインする。 */
  const persistentHighlightNodeIds = useMemo(() => {
    if (!segmentBranch) return new Set<string>();
    const prevFocus = lastEffectiveFocusNodeIdsRef.current;
    const currHighlighted = neighborNodeIdSet;
    const persistent = new Set<string>();
    currHighlighted.forEach((id) => {
      if (prevFocus.has(id)) persistent.add(id);
    });
    return persistent;
  }, [segmentBranch, neighborNodeIdSet]);

  /** セグメントアニメ完了時、または非セグメントモード時のみ前回 effectiveFocus を更新。
   * neighborNodeIdSet ではなく effectiveFocusNodeIds を使用することで、隣接のみのノードを除外。 */
  const shouldUpdateLastEffectiveFocus =
    !showFullGraph && hasSpecificSegmentFocus;
  if (segmentBranch && (segmentProgress ?? 0) >= 1 && shouldUpdateLastEffectiveFocus) {
    lastEffectiveFocusNodeIdsRef.current = new Set(effectiveFocusNodeIds);
  } else if (!segmentBranch && shouldUpdateLastEffectiveFocus) {
    lastEffectiveFocusNodeIdsRef.current = new Set(effectiveFocusNodeIds);
  }

  /** progress を引数で受け取り、RAF からも呼べるようにした版 */
  const getTargetNodeOpacityForProgress = useCallback(
    (node: CustomNodeType, progress: number): number => {
      const isFocus = focusNodeIdSet.has(node.id);
      const isNeighbor = neighborNodeIdSet.has(node.id);
      if (freeExploreMode) {
        return isFocus
          ? FOCUS_NODE_OPACITY
          : isNeighbor
            ? EXPLORE_NEIGHBOR_NODE_OPACITY
            : EXPLORE_DIM_NODE_OPACITY;
      }
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
        if (progress >= SOURCE_FADE_END) return maxOpacity;
        return (progress / SOURCE_FADE_END) * maxOpacity;
      }
      if (isTarget && !isSource) {
        if (progress <= TARGET_FADE_START) return 0;
        if (progress >= TARGET_FADE_START + TARGET_FADE_DURATION) return maxOpacity;
        const t = (progress - TARGET_FADE_START) / TARGET_FADE_DURATION;
        return t * maxOpacity;
      }
      if (isSource && isTarget) {
        if (progress >= SOURCE_FADE_END) return maxOpacity;
        return (progress / SOURCE_FADE_END) * maxOpacity;
      }
      return maxOpacity;
    },
    [
      freeExploreMode,
      focusNodeIdSet,
      hasExplicitEdges,
      neighborNodeIdSet,
      sourceNodeIdsOfFocusEdges,
      targetNodeIdsOfFocusEdges,
    ],
  );

  const getTargetNodeOpacity = useCallback(
    (node: CustomNodeType): number => {
      const effectiveProgress = persistentHighlightNodeIds.has(node.id)
        ? 1
        : displayProgress;
      return getTargetNodeOpacityForProgress(node, effectiveProgress);
    },
    [getTargetNodeOpacityForProgress, displayProgress, persistentHighlightNodeIds],
  );

  const getPrevNodeOpacity = useCallback(
    (node: CustomNodeType): number => {
      const isFocus = transitionFromNodeIdSet.has(node.id);
      const isNeighbor = neighborNodeIdSet.has(node.id);
      if (freeExploreMode) {
        return isFocus
          ? FOCUS_NODE_OPACITY
          : isNeighbor
            ? EXPLORE_NEIGHBOR_NODE_OPACITY
            : EXPLORE_DIM_NODE_OPACITY;
      }
      return isFocus
        ? FOCUS_NODE_OPACITY
        : isNeighbor
          ? NEIGHBOR_NODE_OPACITY
          : DIM_NODE_OPACITY;
    },
    [freeExploreMode, transitionFromNodeIdSet, neighborNodeIdSet],
  );

  const getNodeOpacity = useCallback(
    (node: CustomNodeType): number => {
      const target = getTargetNodeOpacity(node);
      /** セグメントモード時は displayProgress のみ使用。fadeProgress のブレンドをスキップして遅延・二重アニメを防ぐ */
      if (segmentBranch || fadeProgress >= 1) return target;
      const prev = getPrevNodeOpacity(node);
      const eased = easeOutCubic(fadeProgress);
      return prev + (target - prev) * eased;
    },
    [segmentBranch, fadeProgress, getTargetNodeOpacity, getPrevNodeOpacity],
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
    const paddingX = isPc ? forRecording ? 128 : 64 : 48;
    const paddingY = 128; // 上下のみ 128
    let rangeX = maxX - minX || 1;
    let rangeY = maxY - minY || 1;
    let rawScale = Math.min(
      (width - 2 * paddingX) / rangeX,
      (height - 2 * paddingY) / rangeY,
    );
    const maxScale = forRecording ? 8 : MAX_VIEW_SCALE;
    let scale = Math.min(rawScale, maxScale);

    // ラベルを画面内に収めるため、フォーカスノードのラベル範囲で bounds を拡張（2パスでスケールと相互依存を解消）
    const focusNodesWithLabel = nodes.filter(
      (n) => focusIds.has(n.id) && n.x != null && n.y != null && typeof n.name === "string" && n.name.length > 0,
    );
    if (focusNodesWithLabel.length > 0 && scale > 0.7) {
      const fontSizeBase = estimateNodeLabelFontSizeFromScale(scale, forRecording) * (isPc ? 1 : 0.75);
      const fontSize = fontSizeBase * 2; // フォーカス時は2倍になるため保守的に
      let minXExpanded = Infinity;
      let maxXExpanded = -Infinity;
      let minYExpanded = Infinity;
      let maxYExpanded = -Infinity;
      for (const n of focusNodesWithLabel) {
        const name = n.name ?? "";
        const { halfWidth, heightAbove } = estimateLabelMarginLayout(scale, fontSize, name.length);
        minXExpanded = Math.min(minXExpanded, n.x! - halfWidth);
        maxXExpanded = Math.max(maxXExpanded, n.x! + halfWidth);
        minYExpanded = Math.min(minYExpanded, n.y! - heightAbove);
        maxYExpanded = Math.max(maxYExpanded, n.y! + heightAbove);
      }
      minX = Math.min(minX, minXExpanded);
      maxX = Math.max(maxX, maxXExpanded);
      minY = Math.min(minY, minYExpanded);
      maxY = Math.max(maxY, maxYExpanded);
      rangeX = maxX - minX || 1;
      rangeY = maxY - minY || 1;
      rawScale = Math.min(
        (width - 2 * paddingX) / rangeX,
        (height - 2 * paddingY) / rangeY,
      );
      scale = Math.min(rawScale, maxScale);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return { scale, centerX, centerY };
  }, [nodes, width, height, effectiveFocusNodeIds, focusEdgeIdSet, links, isPc, communityMap, forRecording]);

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

  /** ラベル表示用の実効スケール（ラベル表示・サイズはスケールに連動）。自由探索時は入室セグメントに依存しない固定基準×ズーム倍率でどのセグメントから入っても一貫したサイズに */
  const effectiveScaleForLabels = freeExploreMode
    ? EXPLORE_BASE_SCALE * zoomScale
    : displayScale;
  /** ノード半径・エッジ太さ・ストロークに使うスケール（effectiveScaleForLabels と同じ値） */
  const scaleForSize = effectiveScaleForLabels;
  /** ノード半径用スケール。探索モード寄り時は段階的に小さくして大きすぎないように */
  const scaleForNodeRadius =
    freeExploreMode && effectiveScaleForLabels > 1
      ? (() => {
        const zoomInFactor =
          effectiveScaleForLabels > 6
            ? 2.5
            : effectiveScaleForLabels > 4
              ? 2
              : effectiveScaleForLabels > 3
                ? 1.6
                : effectiveScaleForLabels > 2
                  ? 1.3
                  : 1.1;
        return scaleForSize / zoomInFactor;
      })()
      : scaleForSize;
  /** ストローク用スケール。探索モード時は薄くなりすぎないよう下限 1 */
  const scaleForStroke = freeExploreMode ? Math.max(1, scaleForSize) : scaleForSize;

  /** ノード半径（generative-layout-graph と同様）。探索モード寄り時は scaleForNodeRadius で段階的に小さく */
  const getNodeRadius = useCallback(
    (node: CustomNodeType) => {
      const baseRadiusLayout =
        1.6 * ((node.neighborLinkCount ?? 0) * 0.1 + 3.6);
      return Math.max(1.5, Math.min(22, baseRadiusLayout * scaleForNodeRadius));
    },
    [scaleForNodeRadius],
  );
  /** ノードラベルを表示する閾値。スクロール表示時は常に表示、探索モード・冒頭グラフ時はズームに応じて表示 */
  const showNodeLabels =
    freeExploreMode || showFullGraph ? effectiveScaleForLabels > 0.7 : true;
  /** ノードラベルフォントサイズの基準値。録画時はスケールに比例、通常時は段階的に。引きのときはスケールに比例して縮小し他ノードとの被りを防ぐ。探索モード時は generative-layout-graph に倣い控えめな値を使用。寄り（ズームイン）時は段階的に小さくして拡大で大きくなりすぎないように */
  const nodeLabelFontSizeBaseRaw = forRecording
    ? Math.max(6, effectiveScaleForLabels) * 0.7
    : freeExploreMode
      ? (() => {
        /** 引きのとき: スケールによらずそのままの大きさ */
        if (effectiveScaleForLabels <= 1) {
          return 9;
        }

        /** 段階的な基準値（寄りほど小さく）。scale>6→2, >4→3, >3→4, >2→5, >1→6 */
        const stepped =
          effectiveScaleForLabels > 6
            ? 3
            : effectiveScaleForLabels > 4
              ? 3
              : effectiveScaleForLabels > 3
                ? 4
                : effectiveScaleForLabels > 2
                  ? 5
                  : 6;
        const base = stepped * 1.5;
        return base;
      })()
      : (() => {
        const stepped =
          effectiveScaleForLabels > 4
            ? 3
            : effectiveScaleForLabels > 3
              ? 4
              : effectiveScaleForLabels > 2
                ? 5
                : effectiveScaleForLabels > 1.5
                  ? 6
                  : effectiveScaleForLabels > 1
                    ? 7
                    : effectiveScaleForLabels > 0.9
                      ? 8
                      : 9;
        const base = stepped * 1.5;
        /** 引きのとき（scale < 1）はスケールに比例して縮小し、ラベル同士の被りを防ぐ。最低 0.4 で極端に小さくならないように */
        const zoomOutFactor =
          effectiveScaleForLabels < 1
            ? Math.max(0.4, effectiveScaleForLabels)
            : 1;
        return base * zoomOutFactor;
      })();
  /** SP版ではノードラベルをPC版の3/4サイズにする。探索モード時は全体的に1.2倍 */
  const nodeLabelFontSizeBase =
    nodeLabelFontSizeBaseRaw * (isPc ? 1 : 0.75) * (freeExploreMode ? 1.2 : 1);
  /** 探索モード時は generative-layout-graph に倣い倍率を控えめに（1.2）、通常時は 2。録画時のフォーカスノードは 4 */
  const nodeLabelFontSizeMultiplier = freeExploreMode ? 1.4 : 2;
  const getNodeLabelFontSize = useCallback(
    (isFocusNode: boolean) =>
      showNodeLabels
        ? nodeLabelFontSizeBase *
        (forRecording && isFocusNode ? 4 : nodeLabelFontSizeMultiplier)
        : 0,
    [showNodeLabels, nodeLabelFontSizeBase, forRecording, nodeLabelFontSizeMultiplier],
  );
  /** エッジラベルを表示する閾値。スクロール表示時は常に表示、探索モード・冒頭グラフ時はズームに応じて表示 */
  const showEdgeLabels =
    freeExploreMode || showFullGraph ? effectiveScaleForLabels > 1.4 : true;
  /** スケールに応じたエッジラベルのフォントサイズ基準値。引きのときはノードラベル同様スケールに比例して縮小 */
  const edgeLabelFontSizeBaseRaw =
    effectiveScaleForLabels > 4
      ? 4
      : effectiveScaleForLabels > 3
        ? 5
        : effectiveScaleForLabels > 2
          ? 6
          : effectiveScaleForLabels > 1.5
            ? 7
            : effectiveScaleForLabels > 1
              ? 7
              : effectiveScaleForLabels > 0.9
                ? 7
                : 7;
  const edgeLabelZoomOutFactor =
    effectiveScaleForLabels < 1 ? Math.max(0.4, effectiveScaleForLabels) : 1;
  const edgeLabelFontSizeBase = edgeLabelFontSizeBaseRaw * edgeLabelZoomOutFactor;
  /** エッジラベルフォントサイズ（getNodeLabelFontSize と同様にフォーカス有無で倍率を切り替え） */
  const getEdgeLabelFontSize = useCallback(
    (isFocusEdge: boolean) => {
      const multiplier =
        forRecording && isFocusEdge ? 3 : forRecording ? 2 : isFocusEdge ? 2 : 1;
      const base = edgeLabelFontSizeBase * multiplier;
      return freeExploreMode && isFocusEdge ? base * 0.85 : base;
    },
    [edgeLabelFontSizeBase, forRecording, freeExploreMode],
  );
  /** スケールに応じたエッジ・ノードの線の太さ（探索モード時は scaleForStroke で引きでも薄くならない） */
  const edgeStrokeWidthFocusRaw = forRecording ? Math.max(0.8, Math.min(3.5, 2 * scaleForStroke)) : Math.max(0.4, Math.min(2.5, 2 * scaleForStroke));
  const edgeStrokeWidthNormalRaw = Math.max(0.3, Math.min(1.5, 1.5 * scaleForStroke));
  const edgeStrokeWidthFocus =
    freeExploreMode ? Math.max(forRecording ? 0.8 : 0.4, edgeStrokeWidthFocusRaw * 0.5) : edgeStrokeWidthFocusRaw;
  const edgeStrokeWidthNormal =
    freeExploreMode ? Math.max(0.3, edgeStrokeWidthNormalRaw * 0.5) : edgeStrokeWidthNormalRaw;
  const nodeStrokeWidth = Math.max(0.25, Math.min(1.5, 1.5 * scaleForStroke));
  const toView = useCallback(
    (x: number, y: number) =>
      [
        width / 2 + (x - displayCenterX) * displayScale,
        height / 2 + (y - displayCenterY) * displayScale,
      ] as const,
    [width, height, displayCenterX, displayCenterY, displayScale],
  );

  /** 探索モード時: クライアント座標をレイアウト座標に変換（DnD用） */
  const clientToLayout = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      if (!freeExploreMode || !svgRef.current) return null;
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return null;
      const pt = svgRef.current.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const svgPt = pt.matrixTransform(ctm.inverse());
      const contentX = (svgPt.x - zoomX) / zoomScale;
      const contentY = (svgPt.y - zoomY) / zoomScale;
      const layoutX = displayCenterX + (contentX - width / 2) / displayScale;
      const layoutY = displayCenterY + (contentY - height / 2) / displayScale;
      return { x: layoutX, y: layoutY };
    },
    [
      freeExploreMode,
      zoomX,
      zoomY,
      zoomScale,
      displayCenterX,
      displayCenterY,
      displayScale,
      width,
      height,
    ],
  );
  nodesRef.current = nodes;
  clientToLayoutRef.current = clientToLayout;

  // 探索モード時: SVG にキャプチャで mousedown/touchstart を登録し、ノードクリックを D3 zoom より先に処理する
  useEffect(() => {
    if (!freeExploreMode || !svgRef.current) return;
    const svg = svgRef.current;

    const startDrag = (e: MouseEvent | TouchEvent, clientX: number, clientY: number) => {
      const el = (e.target as Element)?.closest?.("[data-node-id]");
      if (!el) return;
      // モバイルでのスクロール防止などを兼ねて stopPropagation / preventDefault
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();

      const nodeId = el?.getAttribute("data-node-id");
      if (!nodeId) return;
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (node?.x == null || node?.y == null) return;
      const layout = clientToLayoutRef.current?.(clientX, clientY);
      if (!layout) return;

      dragStartRef.current = {
        nodeId: node.id,
        startNodeX: node.x,
        startNodeY: node.y,
        startPointerLayoutX: layout.x,
        startPointerLayoutY: layout.y,
      };
      setDraggingNodeId(node.id);
    };

    const onMouseDown = (e: MouseEvent) => {
      startDrag(e, e.clientX, e.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        startDrag(e, touch.clientX, touch.clientY);
      }
    };

    svg.addEventListener("mousedown", onMouseDown, true);
    svg.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });

    return () => {
      svg.removeEventListener("mousedown", onMouseDown, true);
      svg.removeEventListener("touchstart", onTouchStart, { capture: true });
    };
  }, [freeExploreMode]);

  useEffect(() => {
    if (!draggingNodeId) return;

    const handleMove = (clientX: number, clientY: number) => {
      const start = dragStartRef.current;
      if (!start || start.nodeId !== draggingNodeId) return;
      const layout = clientToLayout(clientX, clientY);
      if (!layout) return;
      const newX = start.startNodeX + (layout.x - start.startPointerLayoutX);
      const newY = start.startNodeY + (layout.y - start.startPointerLayoutY);

      setNodes((prev) => {
        const next = prev.map((n) =>
          n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n,
        );
        setLinks((prevLinks) =>
          prevLinks.map((link) => ({
            ...link,
            source:
              next.find((n) => n.id === (link.source as CustomNodeType).id) ??
              link.source,
            target:
              next.find((n) => n.id === (link.target as CustomNodeType).id) ??
              link.target,
          })),
        );
        return next;
      });
    };

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        // スクロールなどのデフォルト動作を防ぐ
        if (e.cancelable) e.preventDefault();
        handleMove(touch.clientX, touch.clientY);
      }
    };

    const onEnd = () => {
      setDraggingNodeId(null);
    };

    document.addEventListener("mousemove", onMouseMove, { passive: false });
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [draggingNodeId, clientToLayout]);

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

  const shouldApplyCulling = useMemo(
    () =>
      isTransitionComplete &&
      (showFullGraph || nodesToRender.length > CULLING_THRESHOLD),
    [isTransitionComplete, showFullGraph, nodesToRender.length],
  );

  /** カリング用のビューポート（view 座標）。探索モード時は zoom 変換を考慮する */
  const cullingViewport = useMemo(() => {
    const margin = CULLING_VIEWPORT_MARGIN;
    if (freeExploreMode) {
      const k = zoomScale;
      return {
        minX: (-zoomX - margin) / k,
        minY: (-zoomY - margin) / k,
        maxX: (width - zoomX + margin) / k,
        maxY: (height - zoomY + margin) / k,
      };
    }
    return {
      minX: -margin,
      minY: -margin,
      maxX: width + margin,
      maxY: height + margin,
    };
  }, [freeExploreMode, width, height, zoomScale, zoomX, zoomY]);

  const visibleNodesToRender = useMemo(() => {
    if (!shouldApplyCulling) return nodesToRender;
    const { minX, minY, maxX, maxY } = cullingViewport;
    return nodesToRender.filter((node) => {
      if (focusNodeIdSet.has(node.id) || neighborNodeIdSet.has(node.id))
        return true;
      const [vx, vy] = toView(node.x ?? 0, node.y ?? 0);
      return vx >= minX && vx <= maxX && vy >= minY && vy <= maxY;
    });
  }, [
    shouldApplyCulling,
    nodesToRender,
    focusNodeIdSet,
    neighborNodeIdSet,
    toView,
    cullingViewport,
  ]);

  const visibleLinksToRender = useMemo(() => {
    if (!shouldApplyCulling) return linksToRender;
    const { minX, minY, maxX, maxY } = cullingViewport;
    return linksToRender.filter((link) => {
      const src = link.source as CustomNodeType;
      const tgt = link.target as CustomNodeType;
      if (focusEdgeIdSet.has(getEdgeCompositeKeyFromLink(link))) return true;
      const [sx, sy] = toView(src.x ?? 0, src.y ?? 0);
      const [tx, ty] = toView(tgt.x ?? 0, tgt.y ?? 0);
      return isLineSegmentInViewport(sx, sy, tx, ty, minX, minY, maxX, maxY);
    });
  }, [
    shouldApplyCulling,
    linksToRender,
    focusEdgeIdSet,
    toView,
    cullingViewport,
  ]);

  /** 同一ノード対ごとのエッジグループ（代表ラベル＋クリック展開用） */
  const linksByNodePair = useMemo(() => {
    const map = new Map<string, CustomLinkType[]>();
    visibleLinksToRender.forEach((link) => {
      if (!link.source || !link.target) return;
      const key = getNodePairKey(link);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(link);
    });
    return map;
  }, [visibleLinksToRender]);

  /** パス描画用: 同一方向のエッジを1本に集約。逆向きは別パス。代表リンクとその方向にフォーカスが含まれるか */
  const linksForPathRendering = useMemo(() => {
    const byDir = new Map<
      string,
      { link: CustomLinkType; hasFocus: boolean }
    >();
    for (const link of visibleLinksToRender) {
      const key = getDirectionalKey(link);
      const isFocus = focusEdgeIdSet.has(
        getEdgeCompositeKeyFromLink(link),
      );
      const cur = byDir.get(key);
      if (!cur) {
        byDir.set(key, { link, hasFocus: isFocus });
      } else {
        const newHasFocus = cur.hasFocus || isFocus;
        const rep =
          isFocus && !cur.hasFocus ? link : cur.link;
        byDir.set(key, { link: rep, hasFocus: newHasFocus });
      }
    }
    return Array.from(byDir.values());
  }, [visibleLinksToRender, focusEdgeIdSet]);

  /** クリックでラベルを垂直展開したノード対キー（null で閉じる） */
  const [expandedEdgePairKey, setExpandedEdgePairKey] = useState<string | null>(
    null,
  );

  /** 冒頭の全体グラフ表示時のエッジ描画アニメーション進捗（0→1）。showFullGraph 時に再生 */
  const [overviewEdgeProgress, setOverviewEdgeProgress] = useState(0);
  useEffect(() => {
    if (!showFullGraph) {
      setOverviewEdgeProgress(0);
      return;
    }
    const durationMs = FOCUS_TRANSITION_MS;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      setOverviewEdgeProgress(easeOutCubic(t));
      if (t < 1) rafIdRef.current = requestAnimationFrame(tick);
    };
    const rafIdRef = { current: 0 };
    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [showFullGraph]);

  /** ストーリーに含まれるコミュニティID（order が付いているもの） */
  const storyCommunityIdSet = useMemo(
    () =>
      new Set(
        (narrativeFlow ?? []).filter((n) => n.order != null).map((n) => n.communityId),
      ),
    [narrativeFlow],
  );

  /** showFullGraph 時: コミュニティごとの中心・半径・タイトル（print-generative-layout-graph に倣い円とタイトル表示用） */
  const communityDisplayData = useMemo(() => {
    if (!showFullGraph || !communityMap || !nodes.length) return [];
    const groups = new Map<string, CustomNodeType[]>();
    nodes.forEach((n) => {
      const cid = communityMap[n.id];
      if (cid) {
        if (!groups.has(cid)) groups.set(cid, []);
        groups.get(cid)!.push(n);
      }
    });
    const result: Array<{
      communityId: string;
      centerX: number;
      centerY: number;
      radius: number;
      title: string | undefined;
    }> = [];
    groups.forEach((memberNodes, communityId) => {
      const valid = memberNodes.filter(
        (n) => n.x != null && n.y != null && !Number.isNaN(n.x) && !Number.isNaN(n.y),
      );
      if (valid.length === 0) return;
      const centerX =
        valid.reduce((s, n) => s + (n.x ?? 0), 0) / valid.length;
      const centerY =
        valid.reduce((s, n) => s + (n.y ?? 0), 0) / valid.length;
      const maxDist = Math.max(
        ...valid.map((n) => {
          const dx = (n.x ?? 0) - centerX;
          const dy = (n.y ?? 0) - centerY;
          return Math.sqrt(dx * dx + dy * dy);
        }),
      );
      const padding = 24;
      const minRadius = 40;
      const radius = Math.max(minRadius, maxDist + padding);
      const title =
        storyCommunityIdSet.has(communityId) ? communityTitles?.[communityId] : undefined;
      result.push({
        communityId,
        centerX,
        centerY,
        radius,
        title,
      });
    });
    return result;
  }, [showFullGraph, communityMap, nodes, communityTitles, storyCommunityIdSet]);

  /** グラフ全体表示時用: エッジ長（レイアウト座標）の min/max/range（generative と同様の距離ベース透明度に使用） */
  const linkDistanceRange = useMemo(() => {
    const distances = linksForPathRendering
      .map((item) => item.link)
      .map((link) => {
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
  }, [linksForPathRendering]);

  /** パス描画用アイテムにフォーカス時のグラデーションID用インデックスを付与 */
  const pathItemsWithFocusIndex = useMemo(() => {
    let idx = 0;
    return linksForPathRendering.map((item) => ({
      ...item,
      focusGradientIndex: item.hasFocus ? idx++ : -1,
    }));
  }, [linksForPathRendering]);

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

  return (
    <StoryGraphSvgFrame
      svgRef={svgRef}
      width={width}
      height={height}
      freeExploreMode={freeExploreMode}
      showBottomFadeGradient={showBottomFadeGradient}
      edgeFadePx={edgeFadePx}
    >
      <StoryGraphViewportLayer
        freeExploreMode={freeExploreMode}
        svgRef={svgRef}
        zoomScale={zoomScale}
        zoomX={zoomX}
        zoomY={zoomY}
        setZoomScale={setZoomScale}
        setZoomX={setZoomX}
        setZoomY={setZoomY}
      >
        <StoryGraphContent
          shouldRunSteadyAnim={shouldRunSteadyAnim}
          edgeFlowStops={edgeFlowStops}
          pathItemsWithFocusIndex={pathItemsWithFocusIndex}
          toView={toView}
          showFullGraph={showFullGraph}
          communityDisplayData={communityDisplayData}
          displayScale={displayScale}
          onCommunityTitleClick={onCommunityTitleClick}
          hasExplicitEdges={hasExplicitEdges}
          segmentBranch={segmentBranch}
          displayProgress={displayProgress}
          fadeProgress={fadeProgress}
          freeExploreMode={freeExploreMode}
          overviewEdgeProgress={overviewEdgeProgress}
          linkDistanceRange={linkDistanceRange}
          segmentProgress={segmentProgress}
          isPc={isPc}
          edgeStrokeWidthFocus={edgeStrokeWidthFocus}
          edgeStrokeWidthNormal={edgeStrokeWidthNormal}
          neighborNodeIdSet={neighborNodeIdSet}
          edgeOpacities={{
            focus: FOCUS_EDGE_OPACITY,
            neighbor: NEIGHBOR_EDGE_OPACITY,
            dim: DIM_EDGE_OPACITY,
            exploreNeighbor: EXPLORE_NEIGHBOR_EDGE_OPACITY,
            exploreDim: EXPLORE_DIM_EDGE_OPACITY,
          }}
          linksByNodePair={linksByNodePair}
          focusEdgeIdSet={focusEdgeIdSet}
          showEdgeLabels={showEdgeLabels}
          expandedEdgePairKey={expandedEdgePairKey}
          setExpandedEdgePairKey={setExpandedEdgePairKey}
          getEdgeLabelFontSize={getEdgeLabelFontSize}
          visibleNodesToRender={visibleNodesToRender}
          focusNodeIdSet={focusNodeIdSet}
          getNodeOpacity={getNodeOpacity}
          getNodeRadius={getNodeRadius}
          scaleForSize={scaleForSize}
          nodePulseScale={nodePulseScale}
          failedImageNodeIds={failedImageNodeIds}
          setFailedImageNodeIds={setFailedImageNodeIds}
          nodeStrokeWidth={nodeStrokeWidth}
          getNodeLabelFontSize={getNodeLabelFontSize}
          effectiveScaleForLabels={effectiveScaleForLabels}
          draggingNodeId={draggingNodeId}
        />
      </StoryGraphViewportLayer>
    </StoryGraphSvgFrame>
  );
});
