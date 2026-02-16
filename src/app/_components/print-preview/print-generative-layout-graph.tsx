"use client";

import type {
  CustomNodeType,
  CustomLinkType,
  GraphDocumentForFrontend,
} from "@/app/const/types";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceX,
  forceY,
  forceCollide,
} from "d3";
import type { ForceLink } from "d3";
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { getEdgeCompositeKeyFromLink } from "@/app/const/story-segment";
import { darkenHexColor } from "@/app/_utils/color-utils";
import { getMaxEdgeLabelFontSizeByLength } from "@/app/_utils/graph-label-utils";

const FOCUS_NODE_OPACITY = 1;
const DIM_NODE_OPACITY = 0.75;
const DIM_EDGE_OPACITY = 0.75;

// ノード描画用コンポーネント（印刷用：クリック無効）
const PrintGraphNode = memo(function PrintGraphNode({
  node,
  nodeColor,
  queryFiltered,
  isMetaNode = false,
  metaNodeSize,
  isFocused = false,
  isLabelEmphasized = false,
  graphFontSize = 12,
}: {
  node: CustomNodeType;
  nodeColor?: string;
  queryFiltered?: boolean;
  isMetaNode?: boolean;
  metaNodeSize?: number;
  isFocused?: boolean;
  /** ラベルを太字・1.5倍で表示（フォーカスモードかつフォーカス時のみ） */
  isLabelEmphasized?: boolean;
  /** ノードラベルの基本フォントサイズ（デフォルト12） */
  graphFontSize?: number;
}) {
  // 座標が未定義またはNaNの場合は描画しない
  if (
    node.x === undefined ||
    node.y === undefined ||
    isNaN(node.x) ||
    isNaN(node.y)
  ) {
    return null;
  }

  // Metaノードの場合はサイズを大きく、色を変える
  const baseRadius = isMetaNode
    ? Math.max(35, Math.min(250, (metaNodeSize ?? 10) * 20))
    : ((node.neighborLinkCount ?? 0) * 0.1 + 3.6) * (nodeColor ? 1.2 : 1);

  // 印刷用：白背景に合う濃い灰色
  const fillColor = (nodeColor ?? "#4a5568")

  // MetaNode用のグラデーションID（各ノードで一意）
  const gradientId = isMetaNode ? `metaNodeGradient-${node.id}` : undefined;

  const imageUrl = node.properties?.imageUrl as string | undefined;
  const showImage = !!imageUrl;

  const r = showImage ? baseRadius * 3 : baseRadius;

  // フォーカスモードでない場合（isFocusedが未指定のときも含む）は全ノードを通常表示
  const nodeOpacity = isMetaNode ? 1 : (isFocused !== false ? FOCUS_NODE_OPACITY : DIM_NODE_OPACITY);

  const baseFontSize = graphFontSize;
  const labelFontSize = isLabelEmphasized ? baseFontSize * 1.5 : baseFontSize;

  return (
    <g
      key={node.id}
      transform={`translate(${node.x}, ${node.y})`}
      style={{ opacity: nodeOpacity }}
    >
      {showImage ? (
        <>
          <defs>
            <clipPath id={`print-node-image-clip-${node.id}`}>
              <circle r={r} />
            </clipPath>
          </defs>
          <g clipPath={`url(#print-node-image-clip-${node.id})`}>
            <image
              x={-r}
              y={-r}
              width={r * 2}
              height={r * 2}
              href={imageUrl}
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
          <circle
            r={r}
            fill="none"
            stroke={fillColor}
            strokeWidth={queryFiltered ? 2.5 : 1.5}
          />
        </>
      ) : (
        <circle
          r={baseRadius}
          fill={isMetaNode && gradientId ? `url(#${gradientId})` : fillColor}
          opacity={isMetaNode ? 1 : 0.9}
          strokeWidth={isMetaNode ? 0 : queryFiltered ? 2.5 : 0}
        />
      )}
      {/* 印刷用：常にテキストを表示（ズームレベルに関係なく）ただしメタノードはラベルなし */}
      {!isMetaNode && (
        <text
          y={-10}
          textAnchor="middle"
          fill={isLabelEmphasized ? darkenHexColor(fillColor, 0.5) : (queryFiltered ? "#eab000" : "#1f2937")}
          fontSize={labelFontSize}
          fontWeight={isLabelEmphasized ? "bold" : "normal"}
          className="pointer-events-none select-none"
        >
          {node.name}
        </text>
      )}
    </g>
  );
});

import type { PrintLayoutSettings, MetaGraphDisplayMode, TextOverlayDisplayMode, DetailedGraphDisplayMode, WorkspaceTitleDisplayMode } from "./types";

interface StoryItem {
  communityId: string;
  title: string;
  content: string;
  order: number;
}

interface PrintGenerativeLayoutGraphProps {
  width: number;
  height: number;
  graphDocument: GraphDocumentForFrontend;
  filteredGraphDocument?: GraphDocumentForFrontend;
  isLinkFiltered?: boolean;
  nodeSearchQuery?: string;
  metaNodeData?: Array<{
    communityId: string;
    title?: string;
    summary?: string;
    order?: number;
  }>;
  communityMap?: Record<string, string>; // nodeId -> communityId
  originalGraphDocument?: GraphDocumentForFrontend; // 元のグラフデータ
  onCommunityPositionsCalculated?: (positions: Map<string, { x: number; y: number }>) => void; // コミュニティの位置情報を外部に公開
  storyItems?: StoryItem[]; // ストーリーアイテム
  layoutSettings?: PrintLayoutSettings; // レイアウト設定
  /** ストーリーで参照されているノードID（デフォルトで不透明度を分ける） */
  storyReferencedNodeIds?: Set<string> | null;
  /** ストーリーで参照されているエッジ複合キー（デフォルトで不透明度を分ける） */
  storyReferencedEdgeIds?: Set<string> | null;
  workspaceTitle?: string; // ワークスペース名
  onWorkspaceTitlePositionChange?: (pos: { x: number; y: number }) => void; // タイトル位置変更時
  onWorkspaceTitleSizeChange?: (size: { width: number; height: number }) => void; // タイトル表示範囲変更時
  onSectionSizeChange?: (communityId: string, size: { width: number; height: number }) => void; // セクション表示範囲変更時（communityIdごと）
  onCommunityPositionChange?: (communityId: string, pos: { x: number; y: number }) => void; // コミュニティ中心座標のDnD微調整時
  onNodePositionChange?: (nodeId: string, pos: { x: number; y: number }) => void; // ノード座標のDnD微調整時（metaGraphDisplay=none 時のみ）
}

export const PrintGenerativeLayoutGraph = ({
  width,
  height,
  graphDocument,
  filteredGraphDocument,
  isLinkFiltered,
  nodeSearchQuery,
  metaNodeData,
  communityMap,
  originalGraphDocument,
  onCommunityPositionsCalculated,
  storyItems = [],
  layoutSettings,
  storyReferencedNodeIds,
  storyReferencedEdgeIds,
  workspaceTitle,
  onWorkspaceTitlePositionChange,
  onWorkspaceTitleSizeChange,
  onSectionSizeChange,
  onCommunityPositionChange,
  onNodePositionChange,
}: PrintGenerativeLayoutGraphProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  // 詳細グラフ全体のレイアウト（一度だけ計算）
  const [detailedGraphLayout, setDetailedGraphLayout] = useState<{
    nodes: CustomNodeType[];
    links: CustomLinkType[];
  } | null>(null);
  // コミュニティ中心座標
  const [communityCenters, setCommunityCenters] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  // グラフのバウンディングボックス（viewBox計算用）
  const [graphBounds, setGraphBounds] = useState<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);
  // メタグラフノード（コミュニティ中心に固定）
  const [metaGraphNodes, setMetaGraphNodes] = useState<CustomNodeType[]>([]);
  const [metaGraphLinks, setMetaGraphLinks] = useState<CustomLinkType[]>([]);
  // テキストセクションの位置（ドラッグで調整可能）
  const [textPositions, setTextPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  // ドラッグ中の状態
  const [dragging, setDragging] = useState<{
    communityId: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  // メタグラフの表示モード（layoutSettingsから取得）
  const metaGraphDisplayMode: MetaGraphDisplayMode = layoutSettings?.metaGraphDisplay ?? "none";
  // テキストオーバーレイの表示モード（layoutSettingsから取得）
  const textOverlayDisplayMode: TextOverlayDisplayMode = layoutSettings?.textOverlayDisplay ?? "none";
  // ワークスペースタイトルの表示モード（layoutSettingsから取得）
  const workspaceTitleDisplayMode: WorkspaceTitleDisplayMode =
    layoutSettings?.workspaceTitleDisplay === "show" ? "show" : "none";
  // ワークスペースタイトルのドラッグ中位置（ドラッグ中のみ使用）
  const [workspaceTitleDragPosition, setWorkspaceTitleDragPosition] = useState<{ x: number; y: number } | null>(null);
  // コミュニティ中心のドラッグ中位置（MetaGraph表示時のみDnD可）
  const [communityCenterDragPosition, setCommunityCenterDragPosition] = useState<{ communityId: string; x: number; y: number } | null>(null);
  // ノードのドラッグ中位置（metaGraphDisplay=none 時に詳細グラフノードをDnD可）
  const [nodeDragPosition, setNodeDragPosition] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  // リサイズ中の状態（右下ハンドルDnD用）
  const [resizing, setResizing] = useState<{
    target: string;
    elemX: number;
    elemY: number;
    startWidth: number;
    startHeight: number;
    startSvgX: number;
    startSvgY: number;
  } | null>(null);
  // リサイズ中のプレビュー尺寸（スムーズ表示用）
  const [resizePreviewSize, setResizePreviewSize] = useState<{ width: number; height: number } | null>(null);
  // レイアウト方向（layoutSettingsから取得）
  const layoutOrientation = layoutSettings?.layoutOrientation ?? "vertical";
  // 詳細グラフの表示モード（layoutSettingsから取得）
  const detailedGraphDisplayMode: DetailedGraphDisplayMode = layoutSettings?.detailedGraphDisplay ?? "all";

  // ストーリーで参照されているノード・エッジ（デフォルトで不透明度を分ける）
  const focusedNodeIds = storyReferencedNodeIds ?? null;
  const focusedEdgeIds = storyReferencedEdgeIds ?? null;
  // 参照あり時は不透明度を分ける
  const hasFocusMode = (focusedNodeIds != null && focusedNodeIds.size > 0) ||
    (focusedEdgeIds != null && focusedEdgeIds.size > 0);

  // フォーカスノード＋フォーカスエッジの両端ノード（storytelling-graph-unified と同様）
  const effectiveFocusedNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (focusedNodeIds) focusedNodeIds.forEach((id) => set.add(id));
    if (focusedEdgeIds?.size && originalGraphDocument?.relationships) {
      originalGraphDocument.relationships.forEach((rel) => {
        const key = getEdgeCompositeKeyFromLink({
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          type: rel.type ?? "",
        });
        if (focusedEdgeIds.has(key)) {
          set.add(rel.sourceId);
          set.add(rel.targetId);
        }
      });
    }
    return set;
  }, [focusedNodeIds, focusedEdgeIds, originalGraphDocument?.relationships]);

  // エッジの色（layoutSettingsから取得）
  const edgeBaseColor = layoutSettings?.edgeColor ?? "#60a5fa";
  const edgeFocusColor =
    (typeof layoutSettings?.edgeFocusColor === "string" && layoutSettings.edgeFocusColor) ||
    darkenHexColor(edgeBaseColor, 0.7);

  // ノードの色（layoutSettingsから取得、詳細グラフのノードに適用）
  const nodeBaseColor = layoutSettings?.nodeColor ?? "#4a5568";
  const nodeFocusColor =
    (typeof layoutSettings?.nodeFocusColor === "string" && layoutSettings.nodeFocusColor) ||
    "#2563eb";

  // グラフのノードラベル・エッジラベルのフォントサイズ
  const graphFontSize = (() => {
    const v = layoutSettings?.fontSize?.node;
    return typeof v === "number" && !Number.isNaN(v) ? Math.max(8, Math.min(24, v)) : 12;
  })();
  const edgeLabelBaseSize = (() => {
    const v = layoutSettings?.fontSize?.edge;
    return typeof v === "number" && !Number.isNaN(v) ? Math.max(4, Math.min(20, v)) : 6;
  })();

  // ストーリーコミュニティのノードIDセットを作成（detailedGraphDisplayModeが"story"の場合）
  const storyCommunityNodeIds = useMemo(() => {
    if (detailedGraphDisplayMode !== "story" || !metaNodeData || !communityMap) {
      return null; // 全て表示する場合はnull
    }
    const storyCommunityIds = new Set(
      metaNodeData
        .filter((m) => m.order !== undefined)
        .map((m) => m.communityId)
    );
    const nodeIds = new Set<string>();
    Object.entries(communityMap).forEach(([nodeId, communityId]) => {
      if (storyCommunityIds.has(communityId)) {
        nodeIds.add(nodeId);
      }
    });
    return nodeIds;
  }, [detailedGraphDisplayMode, metaNodeData, communityMap]);

  // 詳細グラフ全体のレイアウト計算（width/heightが変更された時に再計算）
  useEffect(() => {
    if (
      !originalGraphDocument ||
      !communityMap ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }

    // width/heightが変更された時は、新しいレイアウトを計算する

    // すべてのノードとエッジを取得
    const allNodes = originalGraphDocument.nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
    })) as CustomNodeType[];

    const allLinks = originalGraphDocument.relationships
      .map((l) => {
        const source = allNodes.find((n) => n.id === l.sourceId);
        const target = allNodes.find((n) => n.id === l.targetId);
        if (!source || !target) {
          console.warn("[PrintGenerativeLayoutGraph] allLinks: 存在しないノードへの参照を除外", {
            linkId: l.id,
            sourceId: l.sourceId,
            targetId: l.targetId,
            missingSource: !source,
            missingTarget: !target,
          });
          return null;
        }
        return {
          ...l,
          source,
          target,
        };
      })
      .filter((link): link is NonNullable<typeof link> => link != null) as CustomLinkType[];

    // コミュニティごとにノードをグループ化
    const communityGroups = new Map<string, CustomNodeType[]>();
    allNodes.forEach((node) => {
      const communityId = communityMap[node.id];
      if (communityId) {
        if (!communityGroups.has(communityId)) {
          communityGroups.set(communityId, []);
        }
        communityGroups.get(communityId)!.push(node);
      }
    });

    // order順に基づいてコミュニティの目標位置を計算
    const hasStoryOrder = metaNodeData?.some((d) => d.order !== undefined);
    const communityTargetPositions = new Map<
      string,
      { x: number; y: number }
    >();

    if (hasStoryOrder && metaNodeData) {
      // ストーリーのコミュニティのY軸位置を取得（左右配置の基準にする）
      const storyCommunityYPositions: number[] = [];

      // ストーリーのコミュニティをorder順にソート
      const sortedStoryCommunities = Array.from(communityGroups.entries())
        .map(([communityId, nodes]) => {
          const metaData = metaNodeData.find(
            (m) => m.communityId === communityId,
          );
          return {
            communityId,
            nodes,
            order: metaData?.order,
            size: nodes.length, // コミュニティのサイズ（ノード数）
          };
        })
        .filter((item) => item.order !== undefined)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      // コミュニティのサイズに基づいて動的に間隔を計算
      const baseSpacing = layoutOrientation === "horizontal" ? height : width; // ベース間隔
      const sizeMultiplier = 0.3; // サイズによる間隔の倍率
      const minSpacing = layoutOrientation === "horizontal" ? height : width; // 最小間隔
      const maxSpacing = layoutOrientation === "horizontal" ? height * 5 : width * 5; // 最大間隔

      let currentPrimary = layoutOrientation === "horizontal" ? height * 0.5 : width * 0.5; // 初期位置（主軸）

      // 各コミュニティの目標位置をorder順に基づいて計算（サイズに応じた間隔）
      sortedStoryCommunities.forEach((item, index) => {
        const { communityId, nodes, order } = item;
        if (order === undefined) return;

        // コミュニティのサイズに基づいて間隔を計算
        const communitySize = nodes.length;
        const currentRadius = Math.sqrt(communitySize); // コミュニティの推定半径

        // 最初のコミュニティ以外は、前のコミュニティの位置 + 間隔
        if (index > 0) {
          const prevItem = sortedStoryCommunities[index - 1];
          if (prevItem) {
            const prevSize = prevItem.size;
            const prevNormalizedSize = Math.sqrt(prevSize / 10);
            const spacingMultiplier = layoutOrientation === "horizontal" ? height : width;
            const prevSpacing = Math.min(
              maxSpacing,
              Math.max(
                minSpacing,
                baseSpacing + prevNormalizedSize * sizeMultiplier * spacingMultiplier,
              ),
            );
            // 前のコミュニティの中心位置 + 前のコミュニティの半径 + 間隔 + 現在のコミュニティの半径
            const prevRadius = Math.sqrt(prevSize); // コミュニティの推定半径
            const prevPrimary = layoutOrientation === "horizontal"
              ? (communityTargetPositions.get(prevItem.communityId)?.y ?? currentPrimary)
              : (communityTargetPositions.get(prevItem.communityId)?.x ?? currentPrimary);
            currentPrimary = prevPrimary + prevRadius + prevSpacing / 4 + currentRadius;
          }
        }

        const targetPrimary = currentPrimary;
        storyCommunityYPositions.push(targetPrimary);

        if (layoutOrientation === "horizontal") {
          // 水平レイアウト: Y軸で順序付け、X軸で左右交互に配置
          // orderが奇数の場合は左側、偶数の場合は右側に配置
          const isLeft = order % 2 === 1;
          const leftX = width * 0.2; // 左側のX位置
          const rightX = width * 0.8; // 右側のX位置
          const targetX = isLeft ? leftX : rightX;
          communityTargetPositions.set(communityId, { x: targetX, y: targetPrimary });
        } else {
          // 垂直レイアウト: X軸で順序付け、Y軸で上下交互に配置
          // orderが奇数の場合は上側、偶数の場合は下側に配置
          const isTop = order % 2 === 1;
          const topY = height * 0.2; // 上側のY位置
          const bottomY = height * 0.8; // 下側のY位置
          const targetY = isTop ? topY : bottomY;
          communityTargetPositions.set(communityId, { x: targetPrimary, y: targetY });
        }
      });

      // ストーリーに入っていないコミュニティを左右に配置
      const nonStoryCommunities = Array.from(communityGroups.entries()).filter(
        ([communityId]) => {
          const metaData = metaNodeData.find(
            (m) => m.communityId === communityId,
          );
          return !metaData?.order;
        },
      );

      // ストーリーのコミュニティの主軸範囲を取得
      const minStoryPrimary =
        storyCommunityYPositions.length > 0
          ? Math.min(...storyCommunityYPositions)
          : (layoutOrientation === "horizontal" ? height * 0.5 : width * 0.5);
      const maxStoryPrimary =
        storyCommunityYPositions.length > 0
          ? Math.max(...storyCommunityYPositions)
          : (layoutOrientation === "horizontal" ? height * 2.5 : width * 2.5);
      const storyPrimaryRange = maxStoryPrimary - minStoryPrimary || (layoutOrientation === "horizontal" ? height * 2 : width * 2);

      // ストーリーに入っていないコミュニティを分散配置
      nonStoryCommunities.forEach(([communityId], index) => {
        // 主軸位置: ストーリーのコミュニティの主軸範囲内に均等に配置
        const normalizedIndex =
          nonStoryCommunities.length > 1
            ? index / (nonStoryCommunities.length - 1)
            : 0.5;
        const targetPrimary = minStoryPrimary + normalizedIndex * storyPrimaryRange;

        if (layoutOrientation === "horizontal") {
          // 水平レイアウト: X軸位置を左右に交互に配置
          const isLeft = index % 2 === 0;
          const targetX = isLeft ? width * 0.1 : width * 1.4;
          communityTargetPositions.set(communityId, { x: targetX, y: targetPrimary });
        } else {
          // 垂直レイアウト: Y軸位置を上下に交互に配置
          const isTop = index % 2 === 0;
          const targetY = isTop ? height * 0.1 : height * 1.4;
          communityTargetPositions.set(communityId, { x: targetPrimary, y: targetY });
        }
      });
    } else {
      // orderがない場合は、コミュニティの初期位置を使用
      communityGroups.forEach((nodes, communityId) => {
        const centerX =
          nodes.reduce((sum, n) => sum + (n.x ?? width / 2), 0) / nodes.length;
        const centerY =
          nodes.reduce((sum, n) => sum + (n.y ?? height / 2), 0) / nodes.length;
        communityTargetPositions.set(communityId, { x: centerX, y: centerY });
      });
    }

    // 詳細グラフのレイアウト計算（コミュニティごとの分離込み）
    const detailedSimulation = forceSimulation<CustomNodeType, CustomLinkType>(
      allNodes,
    )
      .force(
        "link",
        forceLink<CustomNodeType, CustomLinkType>(allLinks)
          .id((d) => d.id)
          .distance(50) // コミュニティ内のノードは近くに配置（generative-layout-graph に合わせる）
          .strength((link) => {
            // エッジのsourceとtargetのコミュニティIDを取得
            const source = link.source as CustomNodeType;
            const target = link.target as CustomNodeType;
            const sourceCommunityId = communityMap?.[source.id];
            const targetCommunityId = communityMap?.[target.id];

            // コミュニティ間のエッジ（異なるコミュニティに属するノード間）の強度を下げる
            if (sourceCommunityId && targetCommunityId && sourceCommunityId !== targetCommunityId) {
              return 0.001; // コミュニティ間のエッジは弱い強度
            }

            // 同じコミュニティ内のエッジは通常の強度
            return 0.1;
          }),
      )
      .force("charge", forceManyBody().strength(-300)) // 弱い反発力（generative-layout-graph に合わせる）
      .force("collide", forceCollide(30)) // 衝突半径（generative-layout-graph に合わせる）
      .force("center", forceCenter(width / 2, height / 2).strength(0.05)); // 中心への引力を弱める

    // コミュニティごとに目標位置への引力を追加（forceX/forceYを使用）
    if (hasStoryOrder) {
      // Y軸方向の引力（コミュニティの目標Y座標に向かう）
      detailedSimulation.force(
        "y",
        forceY<CustomNodeType>((d) => {
          const communityId = communityMap[d.id];
          if (!communityId) return height / 2;
          const targetPos = communityTargetPositions.get(communityId);
          return targetPos ? targetPos.y : height / 2;
        }).strength((d) => {
          const communityId = communityMap[d.id];
          return communityId ? 0.15 : 0.0001; // コミュニティに属するノードは強く固定
        }),
      );

      // X軸方向の引力（コミュニティの目標X座標に向かう）
      detailedSimulation.force(
        "x",
        forceX<CustomNodeType>((d) => {
          const communityId = communityMap[d.id];
          if (!communityId) return width / 2;
          const targetPos = communityTargetPositions.get(communityId);
          return targetPos ? targetPos.x : width / 2;
        }).strength((d) => {
          const communityId = communityMap[d.id];
          return communityId ? 0.15 : 0.0001; // コミュニティに属するノードは強く固定
        }),
      );
    }

    // シミュレーション実行（収束するまで実行）
    detailedSimulation.alpha(1).restart();

    // alpha値が十分に小さくなるまで実行（収束を待つ）
    let iterations = 0;
    const maxIterations = 2000;
    while (detailedSimulation.alpha() > 0.001 && iterations < maxIterations) {
      detailedSimulation.tick();
      iterations++;
    }

    detailedSimulation.stop();

    const linkForce =
      detailedSimulation.force<ForceLink<CustomNodeType, CustomLinkType>>(
        "link",
      );
    const finalLinks = linkForce ? [...linkForce.links()] : allLinks;

    setDetailedGraphLayout({
      nodes: [...detailedSimulation.nodes()],
      links: finalLinks,
    });

    detailedSimulation.stop();
  }, [
    originalGraphDocument,
    communityMap,
    width,
    height,
    metaNodeData, // order順の整列に必要
    layoutOrientation, // レイアウト方向の変更に応じて再計算
    // detailedGraphLayoutを依存配列から削除（再計算を可能にするため）
  ]);

  // コミュニティ中心座標の計算
  useEffect(() => {
    if (!detailedGraphLayout || !communityMap) return;

    const centers = new Map<string, { x: number; y: number }>();
    const communityGroups = new Map<string, CustomNodeType[]>();

    // コミュニティごとにノードをグループ化
    detailedGraphLayout.nodes.forEach((node) => {
      const communityId = communityMap[node.id];
      if (communityId) {
        if (!communityGroups.has(communityId)) {
          communityGroups.set(communityId, []);
        }
        communityGroups.get(communityId)!.push(node);
      }
    });

    // 各コミュニティの中心座標を計算
    communityGroups.forEach((nodes, communityId) => {
      const validNodes = nodes.filter(
        (n) => n.x !== undefined && n.y !== undefined,
      );
      if (validNodes.length > 0) {
        const centerX =
          validNodes.reduce((sum, n) => sum + (n.x ?? 0), 0) /
          validNodes.length;
        const centerY =
          validNodes.reduce((sum, n) => sum + (n.y ?? 0), 0) /
          validNodes.length;
        centers.set(communityId, { x: centerX, y: centerY });
      }
    });

    setCommunityCenters(centers);

    // コールバックで位置情報を外部に公開
    if (onCommunityPositionsCalculated) {
      onCommunityPositionsCalculated(centers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailedGraphLayout, communityMap]);

  // DnD終了時に communityPositions が更新されたら、詳細グラフのノード位置をシフト
  // ドラッグ中は communityCenterDragPosition で表示のみ更新、ここでは更新しない
  useEffect(() => {
    if (
      !detailedGraphLayout ||
      !communityMap ||
      !layoutSettings?.communityPositions ||
      Object.keys(layoutSettings.communityPositions).length === 0
    ) {
      return;
    }

    const overrides = layoutSettings.communityPositions;

    // コミュニティごとにノードをグループ化
    const communityGroups = new Map<string, CustomNodeType[]>();
    detailedGraphLayout.nodes.forEach((node) => {
      const communityId = communityMap[node.id];
      if (communityId) {
        if (!communityGroups.has(communityId)) {
          communityGroups.set(communityId, []);
        }
        communityGroups.get(communityId)!.push(node);
      }
    });

    let hasChanges = false;
    communityGroups.forEach((nodes, communityId) => {
      const targetPos = overrides[communityId];
      if (!targetPos || typeof targetPos.x !== "number" || typeof targetPos.y !== "number") {
        return;
      }

      const validNodes = nodes.filter((n) => n.x !== undefined && n.y !== undefined);
      if (validNodes.length === 0) return;

      const currentCenterX =
        validNodes.reduce((sum, n) => sum + (n.x ?? 0), 0) / validNodes.length;
      const currentCenterY =
        validNodes.reduce((sum, n) => sum + (n.y ?? 0), 0) / validNodes.length;

      const deltaX = targetPos.x - currentCenterX;
      const deltaY = targetPos.y - currentCenterY;

      if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) return;

      hasChanges = true;
      validNodes.forEach((node) => {
        node.x = (node.x ?? 0) + deltaX;
        node.y = (node.y ?? 0) + deltaY;
      });
    });

    if (hasChanges) {
      // 不変更新: 新しいノードオブジェクトを作成し、リンクの参照も更新する
      // （PrintGraphNode の memo が参照変更を検知して再描画するため）
      setDetailedGraphLayout((prev) => {
        if (!prev) return null;
        const nodeById = new Map<string, CustomNodeType>();
        const newNodes = prev.nodes.map((node) => {
          const updated = { ...node } as CustomNodeType;
          nodeById.set(node.id, updated);
          return updated;
        });
        const newLinks = prev.links.map((link) => {
          const src = link.source as CustomNodeType;
          const tgt = link.target as CustomNodeType;
          return {
            ...link,
            source: nodeById.get(src.id) ?? src,
            target: nodeById.get(tgt.id) ?? tgt,
          };
        }) as CustomLinkType[];
        return { nodes: newNodes, links: newLinks };
      });
    }
  }, [layoutSettings?.communityPositions, detailedGraphLayout, communityMap]);

  // textPositionsの内容をシリアライズして比較用のキーを生成
  const textPositionsKey = useMemo(() => {
    return Array.from(textPositions.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, pos]) => `${id}:${pos.x.toFixed(2)},${pos.y.toFixed(2)}`)
      .join("|");
  }, [textPositions]);

  // コミュニティ中心座標の実効値（DnD調整・保存済みオーバーライドをマージ）
  const effectiveCommunityCenters = useMemo(() => {
    const result = new Map<string, { x: number; y: number }>();
    const allIds = new Set<string>([
      ...communityCenters.keys(),
      ...Object.keys(layoutSettings?.communityPositions ?? {}),
      ...(communityCenterDragPosition ? [communityCenterDragPosition.communityId] : []),
    ]);
    allIds.forEach((id) => {
      if (communityCenterDragPosition?.communityId === id) {
        result.set(id, { x: communityCenterDragPosition.x, y: communityCenterDragPosition.y });
      } else {
        const override = layoutSettings?.communityPositions?.[id];
        if (override && typeof override.x === "number" && typeof override.y === "number") {
          result.set(id, override);
        } else {
          const base = communityCenters.get(id);
          if (base) result.set(id, base);
        }
      }
    });
    return result;
  }, [communityCenters, layoutSettings?.communityPositions, communityCenterDragPosition]);

  // 詳細グラフのノードオフセット計算用：communityCenterDragPosition を除外し DnD 終了後にのみ座標更新
  const stableCommunityCenters = useMemo(() => {
    const result = new Map<string, { x: number; y: number }>();
    const allIds = new Set<string>([
      ...communityCenters.keys(),
      ...Object.keys(layoutSettings?.communityPositions ?? {}),
    ]);
    allIds.forEach((id) => {
      const override = layoutSettings?.communityPositions?.[id];
      if (override && typeof override.x === "number" && typeof override.y === "number") {
        result.set(id, override);
      } else {
        const base = communityCenters.get(id);
        if (base) result.set(id, base);
      }
    });
    return result;
  }, [communityCenters, layoutSettings?.communityPositions]);

  // グラフのバウンディングボックス計算（コミュニティ中心座標とテキスト位置に依存）
  // textPositionsの変更を追跡するためのref
  const prevGraphBoundsKeyRef = useRef<string>("");

  useEffect(() => {
    if (!detailedGraphLayout || !communityMap || effectiveCommunityCenters.size === 0) return;

    // コミュニティに属するノードのみをフィルタリング
    const validNodes = detailedGraphLayout.nodes.filter((n) => {
      // 座標が有効かチェック
      if (n.x === undefined || n.y === undefined || isNaN(n.x) || isNaN(n.y)) {
        return false;
      }
      // コミュニティに属しているかチェック
      const nodeCommunityId = communityMap?.[n.id];
      return !!nodeCommunityId; // コミュニティに属しているノードのみ
    });

    if (validNodes.length > 0) {
      const nodeXValues = validNodes.map((n) => n.x ?? 0);
      const nodeYValues = validNodes.map((n) => n.y ?? 0);

      // ノードの半径を考慮（最大半径を推定）
      const maxNodeRadius = Math.max(
        ...validNodes.map((n) => 1.6 * ((n.neighborLinkCount ?? 0) * 0.1 + 3.6) * 1.2),
        10, // 最小値
      );

      // リンクの範囲も考慮（リンクの端点）
      let minX = Math.min(...nodeXValues) - maxNodeRadius;
      let minY = Math.min(...nodeYValues) - maxNodeRadius;
      let maxX = Math.max(...nodeXValues) + maxNodeRadius;
      let maxY = Math.max(...nodeYValues) + maxNodeRadius;

      // テキストオーバーレイの範囲も考慮（storyItemsがある場合、かつ表示モードが"none"でない場合）
      const defaultSectionW = layoutOrientation === "horizontal" ? width * 0.75 : width * 0.5;
      const savedSectionSizes = layoutSettings?.sectionSizes as Record<string, { width: number; height: number }> | undefined;

      const getSectionSize = (cid: string) => {
        if (resizePreviewSize && resizing && resizing.target === cid) {
          return { w: resizePreviewSize.width, h: resizePreviewSize.height };
        }
        const s = savedSectionSizes?.[cid];
        return {
          w: s != null && typeof s.width === "number" ? s.width : defaultSectionW,
          h: s != null && typeof s.height === "number" ? s.height : 400,
        };
      };

      if (storyItems && storyItems.length > 0 && effectiveCommunityCenters.size > 0 && textOverlayDisplayMode !== "none") {
        storyItems.forEach((item) => {
          const center = effectiveCommunityCenters.get(item.communityId);
          if (!center) return;

          const { w: sw, h: sh } = getSectionSize(item.communityId);
          const savedPosition = textPositions.get(item.communityId);
          const isLeft = item.order % 2 === 1;
          const defaultX = isLeft ? width + 100 : -(width);
          const defaultY = center.y - 100;

          const textX = savedPosition?.x ?? defaultX;
          const textY = savedPosition?.y ?? defaultY;

          minX = Math.min(minX, textX);
          minY = Math.min(minY, textY);
          maxX = Math.max(maxX, textX + sw);
          maxY = Math.max(maxY, textY + sh);
        });
      }

      // ワークスペースタイトルの範囲も考慮
      const defaultTitleW = width * 0.6;
      const defaultTitleH = 80;
      const savedTitleSize = layoutSettings?.workspaceTitleSize as { width: number; height: number } | undefined;
      const titleW = resizePreviewSize && resizing?.target === "__workspace_title__"
        ? resizePreviewSize.width
        : (savedTitleSize != null && typeof savedTitleSize.width === "number" ? savedTitleSize.width : defaultTitleW);
      const titleH = resizePreviewSize && resizing?.target === "__workspace_title__"
        ? resizePreviewSize.height
        : (savedTitleSize != null && typeof savedTitleSize.height === "number" ? savedTitleSize.height : defaultTitleH);

      if (workspaceTitleDisplayMode === "show" && workspaceTitle) {
        const titleWidth = titleW;
        const titleHeight = titleH;
        const defaultTitlePos = { x: minX + 20, y: minY - titleHeight - 20 };
        let titleX: number;
        let titleY: number;
        if (workspaceTitleDragPosition) {
          titleX = workspaceTitleDragPosition.x;
          titleY = workspaceTitleDragPosition.y;
        } else {
          const pos = layoutSettings?.workspaceTitlePosition as
            | { x: number; y: number }
            | undefined;
          if (pos != null && typeof pos.x === "number" && typeof pos.y === "number") {
            titleX = pos.x;
            titleY = pos.y;
          } else {
            titleX = defaultTitlePos.x;
            titleY = defaultTitlePos.y;
          }
        }
        minX = Math.min(minX, titleX);
        minY = Math.min(minY, titleY);
        maxX = Math.max(maxX, titleX + titleWidth);
        maxY = Math.max(maxY, titleY + titleHeight);
      }

      // バウンディングボックス用にワークスペースタイトルのキーを計算（既存のtitleX/titleYを再利用）
      let workspaceTitleKey = "";
      if (workspaceTitleDisplayMode === "show" && workspaceTitle) {
        let wx: number;
        let wy: number;
        if (workspaceTitleDragPosition) {
          wx = workspaceTitleDragPosition.x;
          wy = workspaceTitleDragPosition.y;
        } else {
          const saved = layoutSettings?.workspaceTitlePosition as { x: number; y: number } | undefined;
          if (saved != null && typeof saved.x === "number" && typeof saved.y === "number") {
            wx = saved.x;
            wy = saved.y;
          } else {
            wx = minX + 20;
            wy = minY - titleH - 20;
          }
        }
        workspaceTitleKey = `${wx},${wy},${titleW},${titleH}`;
      }

      // 余白を追加（グラフの端が見切れないように）
      const padding = Math.max(width, height) * 0.05; // 5%の余白
      const newBounds = {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding,
      };

      // バウンディングボックスが実際に変更されたかチェック
      const sectionSizeKey = textOverlayDisplayMode !== "none" && storyItems
        ? storyItems
          .map((it) => {
            const { w, h } = getSectionSize(it.communityId);
            return `${it.communityId}:${w},${h}`;
          })
          .join("|")
        : "";
      const boundsKey = `${newBounds.minX.toFixed(2)},${newBounds.minY.toFixed(2)},${newBounds.maxX.toFixed(2)},${newBounds.maxY.toFixed(2)}`;
      const combinedKey = `${boundsKey}|${textPositionsKey}|${workspaceTitleKey}|${sectionSizeKey}`;

      // 内容が変更されていない場合はスキップ
      if (prevGraphBoundsKeyRef.current === combinedKey) {
        return;
      }

      prevGraphBoundsKeyRef.current = combinedKey;
      setGraphBounds(newBounds);
    }
  }, [detailedGraphLayout, communityMap, effectiveCommunityCenters, storyItems, width, height, textPositionsKey, textOverlayDisplayMode, workspaceTitleDisplayMode, workspaceTitle, workspaceTitleDragPosition, layoutSettings?.workspaceTitlePosition, layoutSettings?.workspaceTitleSize, layoutSettings?.sectionSizes, layoutOrientation, resizing, resizePreviewSize]);

  // テキスト位置の初期値を計算（コミュニティ中心座標が計算された後）
  // 初期位置を追跡するためのref（ドラッグで調整された位置と区別するため）
  const initialTextPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // 前回のcommunityCentersの内容を追跡するためのref
  const prevCommunityCentersRef = useRef<string>("");
  // 前回のコミュニティ中心座標を保存（変化量を計算するため）
  const prevCommunityCentersMapRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    // 表示モードが"none"の場合はテキスト位置を計算しない
    if (textOverlayDisplayMode === "none" || !effectiveCommunityCenters.size || !storyItems || storyItems.length === 0) return;

    // effectiveCommunityCentersの内容が実際に変更されたかチェック（シリアライズして比較）
    const centersKey = Array.from(effectiveCommunityCenters.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, pos]) => `${id}:${pos.x.toFixed(2)},${pos.y.toFixed(2)}`)
      .join("|");

    // 内容が変更されていない場合はスキップ
    if (prevCommunityCentersRef.current === centersKey) {
      return;
    }

    // 前回のコミュニティ中心座標を取得
    const prevCenters = prevCommunityCentersMapRef.current;

    prevCommunityCentersRef.current = centersKey;
    // 現在のコミュニティ中心座標を保存（次回の比較用）
    prevCommunityCentersMapRef.current = new Map(effectiveCommunityCenters);

    setTextPositions((prev) => {
      const updated = new Map(prev);
      const newInitialPositions = new Map<string, { x: number; y: number }>();
      let hasChanges = false;

      storyItems.forEach((item) => {
        const center = effectiveCommunityCenters.get(item.communityId);
        if (!center) return;

        let expectedX: number;
        let expectedY: number;

        if (layoutOrientation === "horizontal") {
          // 水平レイアウト: 左右交互に配置
          const isLeft = item.order % 2 === 1;
          expectedX = isLeft ? width + 100 : -(width);
          expectedY = center.y - 100;
        } else {
          // 垂直レイアウト: 上下交互に配置
          const isTop = item.order % 2 === 1;
          expectedX = center.x - 100;
          expectedY = isTop ? height + 100 : -(height);
        }

        const initialPosition = { x: expectedX, y: expectedY };
        newInitialPositions.set(item.communityId, initialPosition);

        const existingPosition = updated.get(item.communityId);
        const previousInitialPosition = initialTextPositionsRef.current.get(item.communityId);
        const previousCenter = prevCenters.get(item.communityId);

        // 位置が未設定の場合
        if (!existingPosition) {
          updated.set(item.communityId, initialPosition);
          hasChanges = true;
        } else if (previousInitialPosition && previousCenter) {
          // 現在の位置が以前の初期位置と一致している場合、新しい初期位置に更新
          const isAtInitialPosition =
            Math.abs(existingPosition.x - previousInitialPosition.x) < 1 &&
            Math.abs(existingPosition.y - previousInitialPosition.y) < 1;

          if (isAtInitialPosition) {
            // 初期位置だった場合、新しい初期位置に更新
            updated.set(item.communityId, initialPosition);
            hasChanges = true;
          } else {
            // ドラッグで移動した位置の場合、コミュニティ中心の変化量を加算
            const centerDeltaX = center.x - previousCenter.x;
            const centerDeltaY = center.y - previousCenter.y;
            const adjustedPosition = {
              x: existingPosition.x + centerDeltaX,
              y: existingPosition.y + centerDeltaY,
            };
            updated.set(item.communityId, adjustedPosition);
            hasChanges = true;
          }
        } else if (!previousInitialPosition) {
          // 以前の初期位置が記録されていない場合（初回レンダリング後など）、新しい初期位置に更新
          updated.set(item.communityId, initialPosition);
          hasChanges = true;
        }
      });

      // 初期位置の参照を更新
      initialTextPositionsRef.current = newInitialPositions;

      // 変更があった場合のみ更新
      return hasChanges ? updated : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCommunityCenters, storyItems, width, height, textOverlayDisplayMode, layoutOrientation]);

  // ワークスペースタイトルの初期位置を設定（初回表示時のみ）
  useEffect(() => {
    if (workspaceTitleDisplayMode !== "show" || !workspaceTitle || !onWorkspaceTitlePositionChange || layoutSettings?.workspaceTitlePosition) return;
    if (!graphBounds) return;
    const defaultPos = { x: graphBounds.minX + 20, y: graphBounds.minY - 100 };
    onWorkspaceTitlePositionChange(defaultPos);
  }, [workspaceTitleDisplayMode, workspaceTitle, onWorkspaceTitlePositionChange, layoutSettings?.workspaceTitlePosition, graphBounds]);

  // メタグラフノードの生成（コミュニティ中心に固定、effectiveCommunityCentersを使用）
  useEffect(() => {
    if (
      !filteredGraphDocument ||
      effectiveCommunityCenters.size === 0
    ) {
      setMetaGraphNodes([]);
      setMetaGraphLinks([]);
      return;
    }

    // メタグラフノードをコミュニティ中心座標に配置
    const metaNodes: CustomNodeType[] = filteredGraphDocument.nodes.map(
      (node) => {
        const center = effectiveCommunityCenters.get(node.id);
        if (center) {
          return {
            ...node,
            x: center.x,
            y: center.y,
            fx: center.x, // 固定位置
            fy: center.y,
          } as CustomNodeType;
        }
        return {
          ...node,
          x: width / 2,
          y: height / 2,
        } as CustomNodeType;
      },
    );

    // メタグラフエッジ
    const metaLinks: CustomLinkType[] = filteredGraphDocument.relationships.map(
      (rel) => {
        const sourceNode = metaNodes.find((n) => n.id === rel.sourceId);
        const targetNode = metaNodes.find((n) => n.id === rel.targetId);
        return {
          ...rel,
          source: sourceNode,
          target: targetNode,
        };
      },
    ) as CustomLinkType[];

    setMetaGraphNodes(metaNodes);
    setMetaGraphLinks(metaLinks);
  }, [filteredGraphDocument, effectiveCommunityCenters, width, height]);

  // 印刷用：常に詳細グラフを表示（透明度1.0固定）
  const detailedGraphOpacity = 1.0;
  const metaGraphOpacity = metaGraphDisplayMode !== "none" ? 0.6 : 0.0; // メタグラフの表示/非表示

  // 詳細グラフ用：nodePositions（コミュニティ中心からのオフセット）を常に適用し、表示モードに関わらず一貫した描画位置に
  const effectiveDetailedGraphLayout = useMemo(() => {
    if (!detailedGraphLayout) return null;

    const nodePositionOffsets = layoutSettings?.nodePositions ?? {};
    if (Object.keys(nodePositionOffsets).length === 0 && !nodeDragPosition) {
      return detailedGraphLayout;
    }

    const nodeById = new Map<string, CustomNodeType>();
    const newNodes = detailedGraphLayout.nodes.map((node) => {
      let x: number;
      let y: number;

      if (nodeDragPosition?.nodeId === node.id) {
        x = nodeDragPosition.x;
        y = nodeDragPosition.y;
      } else {
        const communityId = communityMap?.[node.id];
        const center = communityId ? stableCommunityCenters.get(communityId) : null;
        const offset = nodePositionOffsets[node.id];

        if (offset) {
          if (center) {
            x = center.x + offset.x;
            y = center.y + offset.y;
          } else {
            x = offset.x;
            y = offset.y;
          }
        } else {
          x = node.x ?? 0;
          y = node.y ?? 0;
        }
      }

      const updated = { ...node, x, y } as CustomNodeType;
      nodeById.set(node.id, updated);
      return updated;
    });
    const newLinks = detailedGraphLayout.links.map((link) => {
      const src = link.source as CustomNodeType;
      const tgt = link.target as CustomNodeType;
      return {
        ...link,
        source: nodeById.get(src.id) ?? link.source,
        target: nodeById.get(tgt.id) ?? link.target,
      };
    }) as CustomLinkType[];
    return { nodes: newNodes, links: newLinks };
  }, [detailedGraphLayout, layoutSettings?.nodePositions, nodeDragPosition, communityMap, stableCommunityCenters]);

  // 表示するメタグラフノードをフィルタリング
  const visibleMetaGraphNodes = useMemo(() => {
    if (metaGraphDisplayMode === "none") {
      return [];
    }
    if (metaGraphDisplayMode === "story") {
      // ストーリーに含まれるコミュニティのみ
      const storyCommunityIds = new Set(
        metaNodeData?.filter(m => m.order !== undefined).map(m => m.communityId) ?? []
      );
      return metaGraphNodes.filter(node => storyCommunityIds.has(node.id));
    }
    // "all"の場合は全て表示
    return metaGraphNodes;
  }, [metaGraphDisplayMode, metaGraphNodes, metaNodeData]);

  // viewBoxを動的に計算（グラフ全体が表示されるように）
  const viewBox = useMemo(() => {
    if (graphBounds) {
      const viewBoxWidth = graphBounds.maxX - graphBounds.minX;
      const viewBoxHeight = graphBounds.maxY - graphBounds.minY;
      return `${graphBounds.minX} ${graphBounds.minY} ${viewBoxWidth} ${viewBoxHeight}`;
    }
    // グラフのバウンディングボックスが計算されていない場合は、デフォルトのviewBoxを使用
    return `0 0 ${width} ${height}`;
  }, [graphBounds, width, height]);

  // グローバルマウスイベントハンドラー（ドラッグ用）
  useEffect(() => {
    if (!dragging || !svgRef.current) return;

    const isWorkspaceTitleDrag = dragging.communityId === "__workspace_title__";

    const getSvgCoords = (e: MouseEvent) => {
      if (!svgRef.current) return null;
      const svgRect = svgRef.current.getBoundingClientRect();
      const viewBox = svgRef.current.viewBox.baseVal;
      const scaleX = svgRef.current.clientWidth / viewBox.width;
      const scaleY = svgRef.current.clientHeight / viewBox.height;
      const svgX = (e.clientX - svgRect.left) / scaleX + viewBox.x;
      const svgY = (e.clientY - svgRect.top) / scaleY + viewBox.y;
      return { x: svgX - dragging.offsetX, y: svgY - dragging.offsetY };
    };

    const isCommunityCenterDrag =
      metaGraphDisplayMode !== "none" &&
      dragging.communityId !== "__workspace_title__" &&
      !dragging.communityId.startsWith("node:") &&
      visibleMetaGraphNodes.some((n) => n.id === dragging.communityId);

    const isNodeDrag =
      metaGraphDisplayMode === "none" &&
      dragging.communityId.startsWith("node:") &&
      onNodePositionChange;

    const handleMouseMove = (e: MouseEvent) => {
      const coords = getSvgCoords(e);
      if (!coords) return;

      if (isWorkspaceTitleDrag) {
        setWorkspaceTitleDragPosition(coords);
      } else if (isCommunityCenterDrag) {
        setCommunityCenterDragPosition({
          communityId: dragging.communityId,
          x: coords.x,
          y: coords.y,
        });
      } else if (isNodeDrag) {
        setNodeDragPosition({
          nodeId: dragging.communityId.replace(/^node:/, ""),
          x: coords.x,
          y: coords.y,
        });
      } else {
        setTextPositions((prev) => {
          const updated = new Map(prev);
          updated.set(dragging.communityId, coords);
          return updated;
        });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isWorkspaceTitleDrag && onWorkspaceTitlePositionChange) {
        const coords = getSvgCoords(e);
        if (coords) onWorkspaceTitlePositionChange(coords);
        setWorkspaceTitleDragPosition(null);
      } else if (isCommunityCenterDrag && onCommunityPositionChange) {
        const coords = getSvgCoords(e);
        if (coords) onCommunityPositionChange(dragging.communityId, coords);
        setCommunityCenterDragPosition(null);
      } else if (isNodeDrag && onNodePositionChange) {
        const coords = getSvgCoords(e);
        const nodeId = dragging.communityId.replace(/^node:/, "");
        if (coords && nodeId) {
          const communityId = communityMap?.[nodeId];
          const center = communityId ? effectiveCommunityCenters.get(communityId) : null;
          if (center) {
            onNodePositionChange(nodeId, {
              x: coords.x - center.x,
              y: coords.y - center.y,
            });
          } else {
            onNodePositionChange(nodeId, coords);
          }
        }
        setNodeDragPosition(null);
      }
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, onWorkspaceTitlePositionChange, onCommunityPositionChange, onNodePositionChange, metaGraphDisplayMode, visibleMetaGraphNodes, communityMap, effectiveCommunityCenters]);

  // metaGraphDisplay=none 時: 詳細グラフノードのDnD開始（storytelling-graph-unified 探索モードと同様）
  useEffect(() => {
    if (metaGraphDisplayMode !== "none" || !onNodePositionChange || !svgRef.current) return;
    const svg = svgRef.current;

    const startNodeDrag = (e: MouseEvent | TouchEvent, clientX: number, clientY: number) => {
      const el = (e.target as Element)?.closest?.("[data-node-id]");
      if (!el) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();

      const nodeId = el.getAttribute("data-node-id");
      if (!nodeId) return;
      const node = effectiveDetailedGraphLayout?.nodes.find((n) => n.id === nodeId);
      if (node?.x === undefined || node.y === undefined) return;

      const svgRect = svg.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal;
      const scaleX = svg.clientWidth / viewBox.width;
      const scaleY = svg.clientHeight / viewBox.height;
      const svgX = (clientX - svgRect.left) / scaleX + viewBox.x;
      const svgY = (clientY - svgRect.top) / scaleY + viewBox.y;

      setDragging({
        communityId: `node:${nodeId}`,
        startX: svgX,
        startY: svgY,
        offsetX: svgX - node.x,
        offsetY: svgY - node.y,
      });
    };

    const onMouseDown = (e: MouseEvent) => {
      startNodeDrag(e, e.clientX, e.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) startNodeDrag(e, touch.clientX, touch.clientY);
    };

    svg.addEventListener("mousedown", onMouseDown, true);
    svg.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });

    return () => {
      svg.removeEventListener("mousedown", onMouseDown, true);
      svg.removeEventListener("touchstart", onTouchStart, { capture: true });
    };
  }, [metaGraphDisplayMode, onNodePositionChange, effectiveDetailedGraphLayout]);

  // リサイズ用グローバルマウスイベントハンドラー
  useEffect(() => {
    if (!resizing || !svgRef.current) return;

    const getSvgCoords = (e: MouseEvent) => {
      if (!svgRef.current) return null;
      const svgRect = svgRef.current.getBoundingClientRect();
      const viewBox = svgRef.current.viewBox.baseVal;
      const scaleX = svgRef.current.clientWidth / viewBox.width;
      const scaleY = svgRef.current.clientHeight / viewBox.height;
      return {
        x: (e.clientX - svgRect.left) / scaleX + viewBox.x,
        y: (e.clientY - svgRect.top) / scaleY + viewBox.y,
      };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const coords = getSvgCoords(e);
      if (!coords) return;

      const newWidth = Math.max(60, coords.x - resizing.elemX);
      const newHeight = Math.max(40, coords.y - resizing.elemY);
      setResizePreviewSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const coords = getSvgCoords(e);
      if (coords) {
        const newWidth = Math.max(60, coords.x - resizing.elemX);
        const newHeight = Math.max(40, coords.y - resizing.elemY);

        if (resizing.target === "__workspace_title__") {
          onWorkspaceTitleSizeChange?.({ width: newWidth, height: newHeight });
        } else {
          onSectionSizeChange?.(resizing.target, { width: newWidth, height: newHeight });
        }
      }
      setResizePreviewSize(null);
      setResizing(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, onWorkspaceTitleSizeChange, onSectionSizeChange]);

  return (
    <div className="relative h-full w-full bg-white" style={{ overflow: "hidden" }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="block"
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          overflow: "visible" // SVG内の要素が見切れないように
        }}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* グラデーション定義（MetaNode用） */}
        <defs>
          {visibleMetaGraphNodes.map((node) => {
            let nodeColor: string;
            if (
              metaNodeData?.some(
                (m) => m.communityId === node.id && m.order !== undefined,
              )
            ) {
              nodeColor = nodeFocusColor; // ストーリーに含まれるコミュニティはフォーカスノード色
            } else {
              nodeColor = darkenHexColor(nodeFocusColor, 0.55); // その他のコミュニティはフォーカスノード色を暗く
            }
            const gradientId = `metaNodeGradient-${node.id}`;
            return (
              <radialGradient key={gradientId} id={gradientId} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={nodeColor} stopOpacity="0.3" />
                <stop offset="50%" stopColor={nodeColor} stopOpacity="0.2" />
                <stop offset="100%" stopColor={nodeColor} stopOpacity="0" />
              </radialGradient>
            );
          })}
        </defs>
        {/* ズーム・パンなし：直接描画 */}
        <g>
          {/* Links */}
          <g className="links">
            {/* 詳細グラフのリンク */}
            {effectiveDetailedGraphLayout && (
              <g
                className="detailed-graph-links"
                opacity={detailedGraphOpacity}
              >
                {(() => {
                  // リンクフィルタが有効な場合、フィルタリングされたリンクのみを使用
                  let linksToRender =
                    isLinkFiltered && originalGraphDocument
                      ? effectiveDetailedGraphLayout.links.filter((link) => {
                        const source = link.source as CustomNodeType;
                        const target = link.target as CustomNodeType;
                        // originalGraphDocumentのrelationshipsに含まれるリンクのみを表示
                        return originalGraphDocument.relationships.some(
                          (rel) =>
                            (rel.sourceId === source.id &&
                              rel.targetId === target.id) ||
                            (rel.sourceId === target.id &&
                              rel.targetId === source.id),
                        );
                      })
                      : effectiveDetailedGraphLayout.links;

                  // ストーリーコミュニティのみ表示する場合、フィルタリング
                  if (storyCommunityNodeIds) {
                    linksToRender = linksToRender.filter((link) => {
                      const source = link.source as CustomNodeType;
                      const target = link.target as CustomNodeType;
                      return (
                        storyCommunityNodeIds.has(source.id) &&
                        storyCommunityNodeIds.has(target.id)
                      );
                    });
                  }

                  // リンクの距離を計算して、最小・最大を取得
                  const linkDistances = linksToRender
                    .map((link) => {
                      const source = link.source as CustomNodeType;
                      const target = link.target as CustomNodeType;
                      if (
                        source.x === undefined ||
                        source.y === undefined ||
                        target.x === undefined ||
                        target.y === undefined ||
                        isNaN(source.x) ||
                        isNaN(source.y) ||
                        isNaN(target.x) ||
                        isNaN(target.y)
                      ) {
                        return null;
                      }
                      const dx = target.x - source.x;
                      const dy = target.y - source.y;
                      return Math.sqrt(dx * dx + dy * dy);
                    })
                    .filter((d): d is number => d !== null);

                  const minDistance =
                    linkDistances.length > 0 ? Math.min(...linkDistances) : 0;
                  const maxDistance =
                    linkDistances.length > 0 ? Math.max(...linkDistances) : 1;
                  const distanceRange = maxDistance - minDistance || 1;

                  // 同じノード間の複数エッジをグループ化（双方向を考慮）
                  const edgeGroups = new Map<string, CustomLinkType[]>();
                  linksToRender.forEach((link) => {
                    const source = link.source as CustomNodeType;
                    const target = link.target as CustomNodeType;
                    const nodeIds = [source.id, target.id].sort();
                    const key = `${nodeIds[0]}-${nodeIds[1]}`;
                    if (!edgeGroups.has(key)) {
                      edgeGroups.set(key, []);
                    }
                    edgeGroups.get(key)!.push(link);
                  });

                  return (
                    <>
                      {/* 1. エッジの線（リンクごとに描画） */}
                      {linksToRender.map((link, i) => {
                        const source = link.source as CustomNodeType;
                        const target = link.target as CustomNodeType;
                        if (
                          source.x === undefined ||
                          source.y === undefined ||
                          target.x === undefined ||
                          target.y === undefined ||
                          isNaN(source.x) ||
                          isNaN(source.y) ||
                          isNaN(target.x) ||
                          isNaN(target.y)
                        ) {
                          return null;
                        }

                        const dx = target.x - source.x;
                        const dy = target.y - source.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const normalizedDistance =
                          distanceRange > 0
                            ? (distance - minDistance) / distanceRange
                            : 0;
                        const centeredDistance = normalizedDistance - 0.5;
                        const bellCurve = Math.max(0, 1 - 4 * centeredDistance * centeredDistance);
                        const changeIntensity = 0.5;
                        const transformedDistance = Math.min(1, Math.max(0,
                          normalizedDistance + bellCurve * changeIntensity * (normalizedDistance - 0.5)
                        ));

                        const baseOpacity = 0.8 - transformedDistance * 0.77;
                        const edgeKey = getEdgeCompositeKeyFromLink({
                          sourceId: link.sourceId ?? source.id,
                          targetId: link.targetId ?? target.id,
                          type: link.type ?? "",
                        });
                        const isFocusEdge =
                          (focusedEdgeIds?.has(edgeKey)) ??
                          (focusedNodeIds != null && focusedNodeIds.has(source.id) && focusedNodeIds.has(target.id));
                        const opacity = hasFocusMode
                          ? (isFocusEdge ? baseOpacity : DIM_EDGE_OPACITY)
                          : baseOpacity;
                        const strokeWidth = 1.8 - transformedDistance * 1.7;

                        return (
                          <g key={`detailed-line-${i}`}>
                            <line
                              x1={source.x}
                              y1={source.y}
                              x2={target.x}
                              y2={target.y}
                              stroke={hasFocusMode && isFocusEdge ? edgeFocusColor : edgeBaseColor}
                              strokeOpacity={opacity}
                              strokeWidth={strokeWidth}
                            />
                          </g>
                        );
                      })}

                      {/* 2. エッジラベル（ノード対ごとに1つ、フォーカスエッジを優先・複数時は「…」） */}
                      {layoutSettings?.showEdgeLabels &&
                        Array.from(edgeGroups.entries()).map(([groupKey, linksInPair]) => {
                          const link = linksInPair[0];
                          if (!link?.type) return null;
                          const source = link.source as CustomNodeType;
                          const target = link.target as CustomNodeType;
                          if (
                            source.x === undefined ||
                            source.y === undefined ||
                            target.x === undefined ||
                            target.y === undefined
                          ) {
                            return null;
                          }

                          const typesInPair = linksInPair
                            .map((l) => l.type ?? "")
                            .filter(Boolean);
                          if (typesInPair.length === 0) return null;

                          // フォーカスエッジを優先：グループ内にフォーカスエッジがあればそのタイプを表示
                          const focusLinks = linksInPair.filter((l) => {
                            const s = l.source as CustomNodeType;
                            const t = l.target as CustomNodeType;
                            const k = getEdgeCompositeKeyFromLink({
                              sourceId: l.sourceId ?? s.id,
                              targetId: l.targetId ?? t.id,
                              type: l.type ?? "",
                            });
                            return (
                              focusedEdgeIds?.has(k) ??
                              (focusedNodeIds != null && focusedNodeIds.has(s.id) && focusedNodeIds.has(t.id))
                            );
                          });
                          const hasFocusInGroup = focusLinks.length > 0;
                          const displayType =
                            hasFocusInGroup && focusLinks[0]?.type
                              ? focusLinks[0].type ?? typesInPair[0]
                              : typesInPair[0];
                          const labelText: string =
                            linksInPair.length > 1
                              ? `${displayType ?? ""} …`
                              : (displayType ?? "");
                          if (!labelText) return null;

                          const dx = target.x - source.x;
                          const dy = target.y - source.y;
                          const distance = Math.sqrt(dx * dx + dy * dy);
                          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                          const labelX = (source.x + target.x) / 2;
                          const labelY = (source.y + target.y) / 2;

                          const baseSize =
                            hasFocusMode && hasFocusInGroup
                              ? edgeLabelBaseSize * 1.2
                              : edgeLabelBaseSize;
                          const maxByEdge = getMaxEdgeLabelFontSizeByLength(
                            distance,
                            labelText.length,
                          );
                          const effectiveFontSize = Math.max(
                            4,
                            Math.min(baseSize, maxByEdge),
                          );

                          const labelOpacity =
                            hasFocusMode && !hasFocusInGroup
                              ? DIM_EDGE_OPACITY
                              : 1;

                          return (
                            <text
                              key={`label-${groupKey}`}
                              x={labelX}
                              y={labelY}
                              textAnchor="middle"
                              fill="#a3b0c7"
                              fontSize={effectiveFontSize}
                              fontWeight={
                                hasFocusMode && hasFocusInGroup ? "bold" : "normal"
                              }
                              className="pointer-events-none select-none"
                              transform={`rotate(${angle}, ${labelX}, ${labelY})`}
                              style={{ opacity: labelOpacity }}
                            >
                              {labelText}
                            </text>
                          );
                        })}
                    </>
                  );
                })()}
              </g>
            )}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {/* メタグラフのノード */}
            {visibleMetaGraphNodes.length > 0 && (
              <g className="meta-graph-nodes" opacity={metaGraphOpacity}>
                {visibleMetaGraphNodes.map((node) => {
                  // メタノードのサイズを計算（node.propertiesから取得）
                  const metaNodeSize = Number(
                    node.properties?.size ?? node.properties?.memberCount ?? 0,
                  );

                  // ノードの色を決定（フォーカスノード色に合わせる）
                  let nodeColor: string;
                  if (
                    metaNodeData?.some(
                      (m) => m.communityId === node.id && m.order !== undefined,
                    )
                  ) {
                    nodeColor = nodeFocusColor; // ストーリーに含まれるコミュニティはフォーカスノード色
                  } else {
                    nodeColor = darkenHexColor(nodeFocusColor, 0.55); // その他のコミュニティはフォーカスノード色を暗く
                  }

                  const handleMetaNodeMouseDown =
                    metaGraphDisplayMode !== "none" && onCommunityPositionChange
                      ? (e: React.MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!svgRef.current) return;

                        const svgRect = svgRef.current.getBoundingClientRect();
                        const viewBox = svgRef.current.viewBox.baseVal;
                        const scaleX = svgRef.current.clientWidth / viewBox.width;
                        const scaleY = svgRef.current.clientHeight / viewBox.height;
                        const svgX = (e.clientX - svgRect.left) / scaleX + viewBox.x;
                        const svgY = (e.clientY - svgRect.top) / scaleY + viewBox.y;

                        setDragging({
                          communityId: node.id,
                          startX: svgX,
                          startY: svgY,
                          offsetX: svgX - (node.x ?? 0),
                          offsetY: svgY - (node.y ?? 0),
                        });
                      }
                      : undefined;

                  return (
                    <g
                      key={`meta-${node.id}`}
                      style={{
                        cursor:
                          metaGraphDisplayMode !== "none" && onCommunityPositionChange
                            ? dragging?.communityId === node.id
                              ? "grabbing"
                              : "grab"
                            : undefined,
                      }}
                      onMouseDown={handleMetaNodeMouseDown}
                    >
                      <PrintGraphNode
                        node={node}
                        queryFiltered={false}
                        nodeColor={nodeColor}
                        isMetaNode={true}
                        metaNodeSize={metaNodeSize}
                        graphFontSize={graphFontSize}
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* 詳細グラフのノード */}
            {effectiveDetailedGraphLayout && (
              <g
                className="detailed-graph-nodes"
                opacity={detailedGraphOpacity}
              >
                {(() => {
                  // リンクフィルタが有効な場合、フィルタリングされたノードのみを使用
                  let nodesToRender =
                    isLinkFiltered && originalGraphDocument
                      ? (() => {
                        // originalGraphDocumentのノードIDセットを作成
                        const filteredNodeIds = new Set(
                          originalGraphDocument.nodes.map((n) => n.id),
                        );
                        // originalGraphDocumentのリレーションシップからリンクを持つノードIDセットを作成
                        const linkedNodeIds = new Set<string>();
                        originalGraphDocument.relationships.forEach((rel) => {
                          linkedNodeIds.add(rel.sourceId);
                          linkedNodeIds.add(rel.targetId);
                        });
                        // フィルタリングされたノードで、かつリンクを持つノードのみを表示
                        return effectiveDetailedGraphLayout.nodes.filter(
                          (node) =>
                            filteredNodeIds.has(node.id) &&
                            linkedNodeIds.has(node.id),
                        );
                      })()
                      : effectiveDetailedGraphLayout.nodes;

                  // ストーリーコミュニティのみ表示する場合、フィルタリング
                  if (storyCommunityNodeIds) {
                    nodesToRender = nodesToRender.filter((node) =>
                      storyCommunityNodeIds.has(node.id)
                    );
                  }

                  return nodesToRender.map((node) => {
                    const queryFiltered =
                      !!nodeSearchQuery &&
                      nodeSearchQuery !== "" &&
                      node.name
                        .toLowerCase()
                        .includes(nodeSearchQuery.toLowerCase());

                    const isFocused = !hasFocusMode || effectiveFocusedNodeIds.has(node.id);
                    // ノードの色：フォーカス状態で切り替え（layoutSettingsから取得）
                    const nodeColor = isFocused ? nodeFocusColor : nodeBaseColor;
                    const isLabelEmphasized = hasFocusMode && effectiveFocusedNodeIds.has(node.id);

                    const isNodeDraggable =
                      metaGraphDisplayMode === "none" && onNodePositionChange;
                    const isDraggingThisNode =
                      dragging?.communityId === `node:${node.id}`;

                    const inner = (
                      <PrintGraphNode
                        node={node}
                        queryFiltered={queryFiltered}
                        nodeColor={nodeColor}
                        isMetaNode={false}
                        isFocused={isFocused}
                        isLabelEmphasized={isLabelEmphasized}
                        graphFontSize={graphFontSize}
                      />
                    );

                    return isNodeDraggable ? (
                      <g
                        key={`detailed-${node.id}`}
                        data-node-id={node.id}
                        style={{
                          cursor: isDraggingThisNode ? "grabbing" : "grab",
                        }}
                      >
                        {inner}
                      </g>
                    ) : (
                      <g key={`detailed-${node.id}`}>{inner}</g>
                    );
                  });
                })()}
              </g>
            )}
          </g>

          {/* Story Text Overlay (SVG内で描画) - ノードの後に描画して前面に表示 */}
          {/* 表示モードが"show"の場合のみ表示 */}
          {textOverlayDisplayMode === "show" && storyItems.length > 0 && effectiveCommunityCenters.size > 0 && (
            <g className="story-text-overlay">
              {storyItems.map((item) => {
                const center = effectiveCommunityCenters.get(item.communityId);
                if (!center) return null;

                // セクションの表示範囲（communityIdごとに個別設定）
                const defaultSectionWidth = layoutOrientation === "horizontal" ? width * 0.75 : width * 0.5;
                const defaultSectionHeight = 400;
                const savedSectionSizes = layoutSettings?.sectionSizes as Record<string, { width: number; height: number }> | undefined;
                const savedSectionSize = savedSectionSizes?.[item.communityId];
                const sectionWidth = resizePreviewSize && resizing?.target === item.communityId
                  ? resizePreviewSize.width
                  : (savedSectionSize != null && typeof savedSectionSize.width === "number" ? savedSectionSize.width : defaultSectionWidth);
                const sectionHeight = resizePreviewSize && resizing?.target === item.communityId
                  ? resizePreviewSize.height
                  : (savedSectionSize != null && typeof savedSectionSize.height === "number" ? savedSectionSize.height : defaultSectionHeight);

                // 位置を取得（ドラッグで調整された位置、または初期位置）
                const savedPosition = textPositions.get(item.communityId);

                let defaultX: number;
                let defaultY: number;

                if (layoutOrientation === "horizontal") {
                  // 水平レイアウト: 左右交互に配置
                  const isLeft = item.order % 2 === 1;
                  defaultX = isLeft
                    ? width + 100   // グラフが左側の場合、テキストを右側に配置
                    : -(width); // グラフが右側の場合、テキストを左側に配置
                  defaultY = center.y - 100; // 少し上に配置して見やすくする
                } else {
                  // 垂直レイアウト: 上下交互に配置
                  const isTop = item.order % 2 === 1;
                  defaultX = center.x - 100; // 少し左に配置して見やすくする
                  defaultY = isTop
                    ? height + 100   // グラフが上側の場合、テキストを下側に配置
                    : -(height); // グラフが下側の場合、テキストを上側に配置
                }

                const textX = savedPosition?.x ?? defaultX;
                const textY = savedPosition?.y ?? defaultY;

                const safeNum = (v: unknown, def: number) =>
                  (typeof v === "number" && !Number.isNaN(v) ? v : def);
                const sectionTitleFontSize = safeNum(layoutSettings?.fontSize?.sectionTitle, 14);
                const bodyFontSize = safeNum(layoutSettings?.fontSize?.body, 12);

                // ドラッグ開始（ハンドル以外の領域）
                const handleMouseDown = (e: React.MouseEvent<SVGForeignObjectElement>) => {
                  e.preventDefault();
                  if (!svgRef.current) return;

                  const svgRect = svgRef.current.getBoundingClientRect();
                  const viewBox = svgRef.current.viewBox.baseVal;
                  const scaleX = svgRef.current.clientWidth / viewBox.width;
                  const scaleY = svgRef.current.clientHeight / viewBox.height;
                  const svgX = (e.clientX - svgRect.left) / scaleX + viewBox.x;
                  const svgY = (e.clientY - svgRect.top) / scaleY + viewBox.y;

                  setDragging({
                    communityId: item.communityId,
                    startX: svgX,
                    startY: svgY,
                    offsetX: svgX - textX,
                    offsetY: svgY - textY,
                  });
                };

                // リサイズハンドル mousedown（ドラッグと競合しないよう stopPropagation）
                const handleResizeMouseDown = (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!svgRef.current) return;

                  const svgRect = svgRef.current.getBoundingClientRect();
                  const viewBox = svgRef.current.viewBox.baseVal;
                  const scaleX = svgRef.current.clientWidth / viewBox.width;
                  const scaleY = svgRef.current.clientHeight / viewBox.height;
                  const svgX = (e.clientX - svgRect.left) / scaleX + viewBox.x;
                  const svgY = (e.clientY - svgRect.top) / scaleY + viewBox.y;

                  setResizing({
                    target: item.communityId,
                    elemX: textX,
                    elemY: textY,
                    startWidth: sectionWidth,
                    startHeight: sectionHeight,
                    startSvgX: svgX,
                    startSvgY: svgY,
                  });
                  setResizePreviewSize({ width: sectionWidth, height: sectionHeight });
                };

                return (
                  <foreignObject
                    key={`story-${item.communityId}`}
                    x={textX}
                    y={textY}
                    width={sectionWidth}
                    height={sectionHeight}
                    onMouseDown={handleMouseDown}
                    style={{
                      cursor: dragging?.communityId === item.communityId ? "grabbing" : "grab",
                      userSelect: "none",
                    }}
                  >
                    <div
                      className="print-story-text-item"
                      style={{
                        position: "relative",
                        width: "100%",
                        height: "100%",
                        fontSize: `${bodyFontSize}pt`,
                        color: "#1f2937",
                        fontFamily: "system-ui, -apple-system, sans-serif",
                        backgroundColor: "rgba(255, 255, 255, 0.3)",
                        backdropFilter: "blur(4px)",
                        WebkitBackdropFilter: "blur(4px)",
                        padding: "16px",
                        borderRadius: "16px",
                        zIndex: 1000,
                        overflow: "hidden",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: `${sectionTitleFontSize}pt`,
                          fontWeight: "bold",
                          marginBottom: "8px",
                          color: "#111827",
                        }}
                      >
                        {item.order}. {item.title}
                      </h3>
                      <div
                        style={{
                          whiteSpace: "pre-line",
                          color: "#374151",
                          lineHeight: "1.6",
                          overflow: "auto",
                          maxHeight: "calc(100% - 60px)",
                        }}
                      >
                        {item.content}
                      </div>
                      {/* 右下リサイズハンドル */}
                      <div
                        role="button"
                        tabIndex={0}
                        onMouseDown={handleResizeMouseDown}
                        style={{
                          position: "absolute",
                          right: 0,
                          bottom: 0,
                          width: 16,
                          height: 16,
                          cursor: "nwse-resize",
                          background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.2) 50%)",
                          borderBottomRightRadius: "12px",
                        }}
                        aria-label="リサイズ"
                      />
                    </div>
                  </foreignObject>
                );
              })}
            </g>
          )}

          {/* ワークスペースタイトルオーバーレイ */}
          {workspaceTitleDisplayMode === "show" && workspaceTitle && (
            <g className="workspace-title-overlay">
              {(() => {
                const defaultTitleWidth = width * 0.6;
                const defaultTitleHeight = 80;
                const savedTitleSize = layoutSettings?.workspaceTitleSize as { width: number; height: number } | undefined;
                const titleWidth = resizePreviewSize && resizing?.target === "__workspace_title__"
                  ? resizePreviewSize.width
                  : (savedTitleSize != null && typeof savedTitleSize.width === "number" ? savedTitleSize.width : defaultTitleWidth);
                const titleHeight = resizePreviewSize && resizing?.target === "__workspace_title__"
                  ? resizePreviewSize.height
                  : (savedTitleSize != null && typeof savedTitleSize.height === "number" ? savedTitleSize.height : defaultTitleHeight);
                const defaultPos = graphBounds
                  ? { x: graphBounds.minX + 20, y: graphBounds.minY - defaultTitleHeight - 20 }
                  : { x: 50, y: 30 };
                let titlePosX: number;
                let titlePosY: number;
                if (workspaceTitleDragPosition) {
                  titlePosX = workspaceTitleDragPosition.x;
                  titlePosY = workspaceTitleDragPosition.y;
                } else {
                  const saved = layoutSettings?.workspaceTitlePosition as { x: number; y: number } | undefined;
                  if (saved != null && typeof saved.x === "number" && typeof saved.y === "number") {
                    titlePosX = saved.x;
                    titlePosY = saved.y;
                  } else {
                    titlePosX = defaultPos.x;
                    titlePosY = defaultPos.y;
                  }
                }
                const titlePos = { x: titlePosX, y: titlePosY };
                const workspaceTitleFontSize = ((v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : 21))(layoutSettings?.fontSize?.workspaceTitle);

                const handleWorkspaceTitleMouseDown = (e: React.MouseEvent<SVGForeignObjectElement>) => {
                  e.preventDefault();
                  if (!svgRef.current) return;

                  const svgRect = svgRef.current.getBoundingClientRect();
                  const viewBox = svgRef.current.viewBox.baseVal;
                  const scaleX = svgRef.current.clientWidth / viewBox.width;
                  const scaleY = svgRef.current.clientHeight / viewBox.height;
                  const svgX = (e.clientX - svgRect.left) / scaleX + viewBox.x;
                  const svgY = (e.clientY - svgRect.top) / scaleY + viewBox.y;

                  setDragging({
                    communityId: "__workspace_title__",
                    startX: svgX,
                    startY: svgY,
                    offsetX: svgX - titlePos.x,
                    offsetY: svgY - titlePos.y,
                  });
                };

                const handleWorkspaceTitleResizeMouseDown = (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!svgRef.current) return;

                  const svgRect = svgRef.current.getBoundingClientRect();
                  const viewBox = svgRef.current.viewBox.baseVal;
                  const scaleX = svgRef.current.clientWidth / viewBox.width;
                  const scaleY = svgRef.current.clientHeight / viewBox.height;
                  const svgX = (e.clientX - svgRect.left) / scaleX + viewBox.x;
                  const svgY = (e.clientY - svgRect.top) / scaleY + viewBox.y;

                  setResizing({
                    target: "__workspace_title__",
                    elemX: titlePos.x,
                    elemY: titlePos.y,
                    startWidth: titleWidth,
                    startHeight: titleHeight,
                    startSvgX: svgX,
                    startSvgY: svgY,
                  });
                  setResizePreviewSize({ width: titleWidth, height: titleHeight });
                };

                return (
                  <foreignObject
                    x={titlePos.x}
                    y={titlePos.y}
                    width={titleWidth}
                    height={titleHeight}
                    onMouseDown={handleWorkspaceTitleMouseDown}
                    style={{
                      cursor: dragging?.communityId === "__workspace_title__" ? "grabbing" : "grab",
                      userSelect: "none",
                    }}
                  >
                    <div
                      className="print-workspace-title"
                      style={{
                        position: "relative",
                        width: "100%",
                        height: "100%",
                        fontSize: `${workspaceTitleFontSize}pt`,
                        fontWeight: "bold",
                        color: "#111827",
                        fontFamily: "system-ui, -apple-system, sans-serif",
                        backgroundColor: "rgba(255, 255, 255, 0.5)",
                        backdropFilter: "blur(4px)",
                        WebkitBackdropFilter: "blur(4px)",
                        padding: "12px 20px",
                        borderRadius: "12px",
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      {workspaceTitle}
                      {/* 右下リサイズハンドル */}
                      <div
                        role="button"
                        tabIndex={0}
                        onMouseDown={handleWorkspaceTitleResizeMouseDown}
                        style={{
                          position: "absolute",
                          right: 0,
                          bottom: 0,
                          width: 16,
                          height: 16,
                          cursor: "nwse-resize",
                          background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.2) 50%)",
                          borderBottomRightRadius: "12px",
                        }}
                        aria-label="リサイズ"
                      />
                    </div>
                  </foreignObject>
                );
              })()}
            </g>
          )}
        </g>
      </svg>
    </div>
  );
};
