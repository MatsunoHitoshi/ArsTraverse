import type {
  CustomNodeType,
  CustomLinkType,
  GraphDocumentForFrontend,
  LayoutInstruction,
} from "@/app/const/types";
import {
  getEdgeCompositeKeyFromLink,
  type FocusedSegmentRef,
} from "@/app/const/story-segment";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceX,
  forceY,
  forceCollide,
} from "d3";
import type { Simulation, ForceLink } from "d3";
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { D3ZoomProvider } from "../zoom";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";
import { Button } from "../../button/button";
import { GraphIcon, ReloadIcon } from "../../icons";

/** 同一ノード対のエッジをグループ化するキー（ソース・ターゲットの順序を正規化） */
function getNodePairKey(link: CustomLinkType): string {
  const a = (link.source as CustomNodeType).id;
  const b = (link.target as CustomNodeType).id;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// リンクがないノードを除外するフィルタ
const linkFilter = (nodes: CustomNodeType[], links: CustomLinkType[]) => {
  const filteredNodes = nodes.filter((node) => {
    return links.find((link) => {
      return link.sourceId === node.id || link.targetId === node.id;
    });
  });
  return filteredNodes;
};

// ノード描画用コンポーネント（簡易版）
const GenerativeGraphNode = memo(function GenerativeGraphNode({
  node,
  currentScale,
  nodeColor,
  onClick,
  queryFiltered,
  isMetaNode = false,
  metaNodeSize,
  storyOrder,
  isEditMode = false,
}: {
  node: CustomNodeType;
  currentScale: number;
  nodeColor?: string;
  onClick?: (node: CustomNodeType) => void;
  queryFiltered?: boolean;
  isMetaNode?: boolean;
  metaNodeSize?: number;
  storyOrder?: number;
  isEditMode?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);

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
    ? Math.max(35, Math.min(250, (metaNodeSize ?? 10) * 18))
    : 1.6 * ((node.neighborLinkCount ?? 0) * 0.1 + 3.6) * (nodeColor ? 1.2 : 1);

  const fillColor = isMetaNode
    ? (nodeColor ?? "#6366f1") // インディゴ色
    : (nodeColor ?? "whitesmoke");

  const strokeColor = isMetaNode ? "#818cf8" : "#eae80c";

  // MetaNode用のグラデーションID（各ノードで一意）
  const gradientId = isMetaNode ? `metaNodeGradient-${node.id}` : undefined;

  // 通常ノードで画像がある場合は円を大きくして画像を表示
  const imageUrl = !isMetaNode
    ? (node.properties?.imageUrl as string | undefined)
    : undefined;
  const showImage =
    !!imageUrl && !imageFailed;
  const r = showImage ? baseRadius * 1.25 : baseRadius;

  return (
    <g
      key={node.id}
      className="cursor-pointer"
      transform={`translate(${node.x}, ${node.y})`}
      onClick={(e) => {
        e.stopPropagation();

        if (isMetaNode) {
          return;
        }

        onClick?.(node);
      }}
    >
      {showImage ? (
        <>
          <defs>
            <clipPath id={`gen-node-image-clip-${node.id}`}>
              <circle r={r} />
            </clipPath>
          </defs>
          <g clipPath={`url(#gen-node-image-clip-${node.id})`}>
            <image
              x={-r}
              y={-r}
              width={r * 2}
              height={r * 2}
              href={imageUrl}
              preserveAspectRatio="xMidYMid slice"
              onError={() => setImageFailed(true)}
            />
          </g>
          <circle
            r={r}
            fill="none"
            stroke={fillColor}
            strokeWidth={queryFiltered ? 2.5 : 1}
          />
        </>
      ) : (
        <circle
          r={r}
          fill={isMetaNode && gradientId ? `url(#${gradientId})` : fillColor}
          opacity={isMetaNode ? 1 : 0.9}
          stroke={isMetaNode ? undefined : strokeColor}
          strokeWidth={isMetaNode ? 0 : queryFiltered ? 2.5 : 0}
        />
      )}
      {currentScale > 0.7 && (
        <text
          y={-10}
          textAnchor="middle"
          fill={queryFiltered ? "#eab000" : "darkgray"}
          fontSize={(currentScale > 4 ? 3 : 6) * 1.5}
          fontWeight="normal"
          className="pointer-events-none select-none"
        >
          {node.name}
        </text>
      )}
      {isMetaNode && metaNodeSize && (
        <>
          <text
            y={baseRadius - 30}
            textAnchor="middle"
            fill="white"
            fontSize={currentScale > 0.3 ? 32 : 40}
            fontWeight="bold"
            className="pointer-events-none select-none"
          >
            {node.name}
          </text>
          <text
            y={baseRadius + 30}
            textAnchor="middle"
            fill="rgba(255, 255, 255, 0.7)"
            fontSize={currentScale > 0.3 ? 28 : 32}
            fontWeight="normal"
            className="pointer-events-none select-none"
          >
            {metaNodeSize} nodes
          </text>
          {/* 編集モード時、ストーリーに含まれている場合は順番の番号を中央に表示 */}
          {isEditMode && storyOrder !== undefined && (
            <text
              y={0}
              textAnchor="middle"
              fill="white"
              fontSize={Math.max(48, baseRadius * 0.8)}
              // fontWeight="bold"
              className="pointer-events-none select-none"
              style={{
                textShadow: "2px 2px 4px rgba(0, 0, 0, 0.8)",
              }}
            >
              {storyOrder}
            </text>
          )}
        </>
      )}
    </g>
  );
});

export const GenerativeLayoutGraph = ({
  width,
  height,
  graphDocument,
  filteredGraphDocument,
  layoutInstruction,
  onNodeClick,
  isLinkFiltered,
  nodeSearchQuery,
  viewMode = "detailed",
  metaNodeData,
  focusedCommunityId,
  focusedSegmentRef = null,
  segmentSelectionEdit = null,
  onSegmentNodeToggle,
  onSegmentEdgeToggle,
  communityMap,
  originalGraphDocument,
  expandZoomThreshold = 0.35,
  collapseZoomThreshold = 0.1,
  onCommunityPositionsCalculated,
  layoutOrientation = "vertical",
  isEditMode = false,
}: {
  width: number;
  height: number;
  graphDocument: GraphDocumentForFrontend;
  filteredGraphDocument?: GraphDocumentForFrontend;
  layoutInstruction?: LayoutInstruction | null;
  onNodeClick?: (node: CustomNodeType) => void;
  isLinkFiltered?: boolean;
  nodeSearchQuery?: string;
  viewMode?: "detailed" | "meta";
  metaNodeData?: Array<{
    communityId: string;
    title?: string;
    summary?: string;
    order?: number;
  }>;
  focusedCommunityId?: string | null;
  focusedSegmentRef?: FocusedSegmentRef | null; // 段落クリック時の局所ハイライト
  /** セグメントのノード・エッジを手動選択中（クリックでトグル） */
  segmentSelectionEdit?: {
    communityId: string;
    paragraphIndex: number;
    nodeIds: string[];
    edgeIds: string[];
  } | null;
  onSegmentNodeToggle?: (nodeId: string) => void;
  onSegmentEdgeToggle?: (edgeKey: string) => void;
  communityMap?: Record<string, string>; // nodeId -> communityId
  originalGraphDocument?: GraphDocumentForFrontend; // 元のグラフデータ
  expandZoomThreshold?: number; // 展開するズームレベル
  collapseZoomThreshold?: number; // 折りたたむズームレベル
  onCommunityPositionsCalculated?: (positions: Map<string, { x: number; y: number }>) => void; // コミュニティの位置情報を外部に公開
  layoutOrientation?: "vertical" | "horizontal"; // レイアウト方向
  isEditMode?: boolean; // ストーリー編集モード
}) => {
  // ハイライト用: 手動選択中は segmentSelectionEdit、それ以外は focusedSegmentRef
  const segmentHighlightNodeIds =
    segmentSelectionEdit?.nodeIds ?? focusedSegmentRef?.nodeIds ?? [];
  const segmentHighlightEdgeIds =
    segmentSelectionEdit?.edgeIds ?? focusedSegmentRef?.edgeIds ?? [];
  const isSegmentHighlightActive =
    segmentSelectionEdit != null || focusedSegmentRef != null;

  const svgRef = useRef<SVGSVGElement>(null);
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [currentTransformX, setCurrentTransformX] = useState<number>(0);
  const [currentTransformY, setCurrentTransformY] = useState<number>(0);
  // 詳細グラフ全体のレイアウト（一度だけ計算）
  const [detailedGraphLayout, setDetailedGraphLayout] = useState<{
    nodes: CustomNodeType[];
    links: CustomLinkType[];
  } | null>(null);
  // コミュニティ中心座標
  const [communityCenters, setCommunityCenters] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  // 詳細グラフを常に表示するモード
  const [alwaysShowDetailedGraph, setAlwaysShowDetailedGraph] =
    useState<boolean>(false);
  // 前回のmetaNodeDataのorder情報を保存（変更検知用）
  const prevMetaNodeDataOrderRef = useRef<string>("");
  /** クリックでラベルを垂直展開したノード対キー（null で閉じる） */
  const [expandedEdgePairKey, setExpandedEdgePairKey] = useState<string | null>(
    null,
  );
  // originalGraphDocument が変わったら詳細レイアウトを再計算するためリセット
  const prevOriginalGraphDocumentRef = useRef<GraphDocumentForFrontend | undefined>(originalGraphDocument);
  useEffect(() => {
    if (prevOriginalGraphDocumentRef.current !== originalGraphDocument) {
      prevOriginalGraphDocumentRef.current = originalGraphDocument;
      setDetailedGraphLayout(null);
      setCommunityCenters(new Map());
    }
  }, [originalGraphDocument]);

  // フィルタリング済みグラフがあればそれを使用、なければ元のグラフを使用
  // Metaモードの場合はメタグラフを使用
  const displayGraph =
    viewMode === "meta" && filteredGraphDocument
      ? filteredGraphDocument
      : (filteredGraphDocument ?? graphDocument);

  // 初期データ変換
  const initNodes = useMemo(() => {
    const nodes = displayGraph.nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 100,
      y: height / 2 + (Math.random() - 0.5) * 100,
    })) as CustomNodeType[];

    // リンクがないノードを除外するフィルタを適用
    if (isLinkFiltered) {
      const links = displayGraph.relationships.map((l) => ({
        ...l,
        sourceId: l.sourceId,
        targetId: l.targetId,
      })) as CustomLinkType[];
      return linkFilter(nodes, links);
    }

    return nodes;
  }, [
    displayGraph.nodes,
    displayGraph.relationships,
    width,
    height,
    isLinkFiltered,
  ]);

  const initLinks = useMemo((): CustomLinkType[] => {
    return displayGraph.relationships
      .map((l) => {
        const source = getNodeByIdForFrontend(
          l.sourceId,
          initNodes,
        ) as CustomNodeType | undefined;
        const target = getNodeByIdForFrontend(
          l.targetId,
          initNodes,
        ) as CustomNodeType | undefined;
        if (!source || !target) {
          console.warn("[GenerativeLayoutGraph] initLinks: 存在しないノードへの参照を除外", {
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
  }, [displayGraph.relationships, initNodes]);

  const [graphNodes, setGraphNodes] = useState<CustomNodeType[]>(initNodes);
  const [graphLinks, setGraphLinks] = useState<CustomLinkType[]>(initLinks);
  // メタグラフノード（コミュニティ中心に固定）
  const [metaGraphNodes, setMetaGraphNodes] = useState<CustomNodeType[]>([]);
  const [metaGraphLinks, setMetaGraphLinks] = useState<CustomLinkType[]>([]);

  // シミュレーション管理
  const simulationRef = useRef<Simulation<
    CustomNodeType,
    CustomLinkType
  > | null>(null);

  // 1. シミュレーション初期化
  useEffect(() => {
    if (width <= 0 || height <= 0 || !initNodes.length) return;

    // メタグラフ表示の場合は、ノード間距離と衝突半径を大きくする
    const isMetaMode = viewMode === "meta";
    const linkDistance = isMetaMode ? 200 : 50; // メタノードの場合は距離を3倍に
    const collideRadius = isMetaMode ? 80 : 10; // メタノードの場合は衝突半径を大きく

    const simulation = forceSimulation<CustomNodeType, CustomLinkType>(
      initNodes,
    )
      .force(
        "link",
        forceLink<CustomNodeType, CustomLinkType>(initLinks)
          .id((d) => d.id)
          .distance(linkDistance)
          .strength(0.1),
      )
      .force("charge", forceManyBody().strength(isMetaMode ? -300 : -100)) // メタノードの場合は反発力を強く
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(collideRadius));

    // リアルタイムレンダリングを無効化し、計算完了後に描画する
    simulation.stop();
    simulation.tick(500);

    setGraphNodes([...simulation.nodes()]);

    const linkForce =
      simulation.force<ForceLink<CustomNodeType, CustomLinkType>>("link");
    if (linkForce) {
      setGraphLinks([...linkForce.links()]);
    }

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [width, height, initNodes, initLinks, viewMode]);

  // 2. レイアウト指示の適用 (Generative Logic)
  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    // メタグラフモードかつストーリー順序がある場合のレイアウト
    const isMetaMode = viewMode === "meta";
    const hasStoryOrder =
      isMetaMode && metaNodeData?.some((d) => d.order !== undefined);

    if (hasStoryOrder) {
      // ストーリー順に並べるレイアウト
      simulation.force("center", null);

      // 順序情報の最大値を取得
      const maxOrder = Math.max(
        ...(metaNodeData
          ?.map((d) => d.order)
          .filter((o): o is number => o !== undefined) ?? [1]),
      );

      const isHorizontal = layoutOrientation === "horizontal";

      // メイン軸: 順序に基づいて配置（縦向き: Y軸、横向き: X軸）
      if (isHorizontal) {
        // 横向き: X軸方向に進み、Y軸方向に交互に配置
        simulation.force(
          "x",
          forceX<CustomNodeType>((d) => {
            const metaData = metaNodeData?.find((m) => m.communityId === d.id);
            if (metaData?.order) {
              const normalizedOrder = (metaData.order - 1) / (maxOrder || 1);
              return normalizedOrder * width * 3;
            }
            return width * 1.5;
          }).strength((d) => {
            const metaData = metaNodeData?.find((m) => m.communityId === d.id);
            return metaData?.order ? 0.3 : 0.05;
          }),
        );

        // サブ軸: Y軸方向に交互に配置
        simulation.force(
          "y",
          forceY<CustomNodeType>((d) => {
            const metaData = metaNodeData?.find((m) => m.communityId === d.id);
            if (metaData?.order) {
              const normalizedOrder = (metaData.order - 1) / (maxOrder || 1);
              // 上下交互に配置
              const isTop = metaData.order % 2 === 1;
              return isTop ? height * 0.3 : height * 0.7;
            }
            return height * 0.5;
          }).strength((d) => {
            const metaData = metaNodeData?.find((m) => m.communityId === d.id);
            return metaData?.order ? 0.1 : 0.05;
          }),
        );
      } else {
        // 縦向き: Y軸方向に進み、X軸方向に交互に配置（元の実装）
        simulation.force(
          "y",
          forceY<CustomNodeType>((d) => {
            const metaData = metaNodeData?.find((m) => m.communityId === d.id);
            if (metaData?.order) {
              const normalizedOrder = (metaData.order - 1) / (maxOrder || 1);
              return normalizedOrder * height * 3;
            }
            return height * 1.5;
          }).strength((d) => {
            const metaData = metaNodeData?.find((m) => m.communityId === d.id);
            return metaData?.order ? 0.3 : 0.05;
          }),
        );

        simulation.force(
          "x",
          forceX<CustomNodeType>((d) => {
            const metaData = metaNodeData?.find((m) => m.communityId === d.id);
            if (metaData?.order) {
              const normalizedOrder = (metaData.order - 1) / (maxOrder || 1);
              return (width * 0.2 + normalizedOrder * (width * 0.8)) * 1.5;
            }
            return width * 0.75;
          }).strength((d) => {
            const metaData = metaNodeData?.find((m) => m.communityId === d.id);
            return metaData?.order ? 0.1 : 0.05;
          }),
        );
      }

      // 衝突判定を維持
      simulation.alpha(1).restart();
      return;
    }

    if (!layoutInstruction) return;

    const { forces } = layoutInstruction;

    if (!forces) return;

    // レイアウト指示が適用される際は、forceCenterを無効化してforceX/forceYの効果を優先
    simulation.force("center", null);

    // X軸の制御（横方向: 左から右）
    if (forces.x_axis) {
      if (forces.x_axis.type === "linear") {
        // 線形配置: X軸方向（横方向）の中央への引力を制御
        // LLMの意図: strengthが高い = 中央への引力が強い = 横方向に集中（狭まる）
        //            strengthが低い = 中央への引力が弱い = 横方向に広がる
        // 実装: strengthを反転して、低い値で中央に引き寄せ、高い値で広がるようにする
        const linearStrength = forces.x_axis.strength ?? 0.5;
        // strengthが高い（0.9）→ 中央への引力を弱く（1.0 - 0.9 = 0.1）→ 横方向に広がる
        // strengthが低い（0.3）→ 中央への引力を強く（1.0 - 0.3 = 0.7）→ 横方向に集中
        const invertedStrength = 1.0 - linearStrength;
        const centerX = width / 2;
        simulation.force("x", forceX(centerX).strength(invertedStrength));
      } else if (forces.x_axis.type === "timeline" && forces.x_axis.attribute) {
        // 時系列配置: 属性値を日付/数値としてパースし、X座標にマッピング
        const attr = forces.x_axis.attribute;
        // 値の範囲を取得（シミュレーション内のノードから直接取得）
        const currentNodes = simulation.nodes();
        const values = currentNodes
          .map((n) => n.properties[attr])
          .filter((v) => v !== undefined)
          .map((v) => {
            const dateVal = new Date(v as string | number).getTime();
            return dateVal || Number(v);
          })
          .filter((v) => !isNaN(v));

        if (values.length === 0) {
          // 値が取得できない場合はデフォルトのforceXを使用
          simulation.force("x", forceX(width / 2).strength(0.1));
        } else {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const range = max - min || 1;

          simulation.force(
            "x",
            forceX((d: CustomNodeType) => {
              const rawVal = d.properties[attr];
              const val =
                typeof rawVal === "string" || typeof rawVal === "number"
                  ? new Date(rawVal).getTime() || Number(rawVal)
                  : 0;
              if (!val && val !== 0) return width / 2; // 値がない場合は中央
              // 画面幅の 10% ~ 90% にマッピング
              const normalized = (val - min) / range;
              return width * 0.1 + normalized * (width * 0.8);
            }).strength(forces.x_axis.strength ?? 0.5),
          );
        }
      } else if (
        forces.x_axis.type === "category_separation" &&
        forces.x_axis.attribute &&
        forces.x_axis.groups
      ) {
        // カテゴリ分離 (X軸)
        const attr = forces.x_axis.attribute;
        const groups = forces.x_axis.groups;
        simulation.force(
          "x",
          forceX((d: CustomNodeType) => {
            const val = d.properties[attr]!;
            if (typeof val === "string") {
              const groupPos = groups[val]; // "left", "right", "center", または数値
              if (groupPos === "left") return width * 0.2;
              if (groupPos === "right") return width * 0.8;
              if (groupPos === "center") return width * 0.5;
              if (typeof groupPos === "number") return width * groupPos;
            }
            return width / 2;
          }).strength(forces.x_axis.strength ?? 0.5),
        );
      } else {
        // X軸の力をリセット（デフォルトの中心引力に戻すなど）
        simulation.force("x", null);
      }
    }

    // Y軸の制御（縦方向: 上から下）
    if (forces.y_axis) {
      if (forces.y_axis.type === "linear") {
        // 線形配置: Y軸方向（縦方向）の中央への引力を制御
        // LLMの意図: strengthが高い = 中央への引力が強い = 縦方向に集中（狭まる）
        //            strengthが低い = 中央への引力が弱い = 縦方向に広がる
        // 実装: strengthを反転して、低い値で中央に引き寄せ、高い値で広がるようにする
        const linearStrength = forces.y_axis.strength ?? 0.5;
        // strengthが高い（0.9）→ 中央への引力を弱く（1.0 - 0.9 = 0.1）→ 縦方向に広がる
        // strengthが低い（0.3）→ 中央への引力を強く（1.0 - 0.3 = 0.7）→ 縦方向に集中
        const invertedStrength = 1.0 - linearStrength;
        const centerY = height / 2;
        simulation.force("y", forceY(centerY).strength(invertedStrength));
      } else if (
        forces.y_axis.type === "category_separation" &&
        forces.y_axis.attribute &&
        forces.y_axis.groups
      ) {
        // カテゴリ分離 (Y軸)
        const attr = forces.y_axis.attribute;
        const groups = forces.y_axis.groups;
        simulation.force(
          "y",
          forceY((d: CustomNodeType) => {
            const val = d.properties[attr]!;
            // 単純なキーワードマッチングや完全一致
            // groupsのキーがプロパティ値に含まれているか等
            let pos = 0.5; // デフォルト中央
            if (val) {
              Object.entries(groups).forEach(([key, value]) => {
                if (val === key || val?.includes(key)) {
                  if (value === "top") pos = 0.2;
                  else if (value === "bottom") pos = 0.8;
                  else if (typeof value === "number") pos = value;
                }
              });
            }
            return height * pos;
          }).strength(forces.y_axis.strength ?? 0.5),
        );
      } else {
        simulation.force("y", null);
      }
    }

    // Charge (反発力) の制御
    if (forces.charge) {
      simulation.force(
        "charge",
        forceManyBody().strength(forces.charge.strength ?? -100),
      );
    }

    // Focus Nodes (局所的な重み付け)
    // D3標準のforceでは個別のcharge設定は難しいが、forceManyBody().strength(d => ...) で可能
    if (forces.focus_nodes) {
      const { targetNodeIds, chargeMultiplier } = forces.focus_nodes;
      const baseStrength = forces.charge?.strength ?? -100;
      simulation.force(
        "charge",
        forceManyBody<CustomNodeType>().strength((d) => {
          if (targetNodeIds.includes(d.id)) {
            return baseStrength * chargeMultiplier;
          }
          return baseStrength;
        }),
      );
    }

    // Center Nodes (特定ノードを中央に配置)
    if (forces.center_nodes) {
      const { targetNodeIds } = forces.center_nodes;
      // 対象ノードを中央に配置するforceXとforceYを追加
      targetNodeIds.forEach((nodeId) => {
        const targetNode = simulation.nodes().find((n) => n.id === nodeId);
        if (targetNode) {
          // 既存のforceX/forceYを上書きせず、特定ノードのみ中央に配置
          // カスタムforceを使用して特定ノードを中央に引き寄せる
          const centerX = width / 2;
          const centerY = height / 2;
          // 対象ノードのx, y座標を直接設定
          targetNode.x = centerX;
          targetNode.y = centerY;
          targetNode.fx = centerX; // fx, fyを設定すると固定される
          targetNode.fy = centerY;
        }
      });
    }

    // シミュレーション再計算
    // 既存のalphaやrestartではなく、stopしてから計算を進める
    simulation.alpha(1);
    simulation.restart();
    simulation.stop();
    simulation.tick(1000);

    setGraphNodes([...simulation.nodes()]);
    const linkForce =
      simulation.force<ForceLink<CustomNodeType, CustomLinkType>>("link");
    if (linkForce) {
      setGraphLinks([...linkForce.links()]);
    }
  }, [layoutInstruction, width, height, metaNodeData, viewMode]);

  // 透明度計算関数
  const calculateOpacity = useMemo(() => {
    return (scale: number): number => {
      if (scale < collapseZoomThreshold) return 0;
      if (scale >= expandZoomThreshold) return 1;
      // 線形補間
      const range = expandZoomThreshold - collapseZoomThreshold;
      const progress = (scale - collapseZoomThreshold) / range;
      return Math.max(0, Math.min(1, progress));
    };
  }, [expandZoomThreshold, collapseZoomThreshold]);

  // 詳細グラフ全体のレイアウト計算（一度だけ）
  useEffect(() => {
    if (
      viewMode !== "meta" ||
      !originalGraphDocument ||
      !communityMap ||
      detailedGraphLayout !== null
    ) {
      return;
    }

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
          console.warn("[GenerativeLayoutGraph] allLinks(詳細レイアウト): 存在しないノードへの参照を除外", {
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
      const isHorizontal = layoutOrientation === "horizontal";

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

      if (isHorizontal) {
        // 横向き: X軸方向に進み、Y軸方向に交互に配置
        const baseSpacing = width; // ベース間隔
        const sizeMultiplier = 0.3;
        const minSpacing = width;
        const maxSpacing = width * 5;

        let currentX = width * 0.5; // 初期X位置
        const storyCommunityXPositions: number[] = [];

        sortedStoryCommunities.forEach((item, index) => {
          const { communityId, nodes, order } = item;
          if (order === undefined) return;

          const communitySize = nodes.length;
          const currentRadius = Math.sqrt(communitySize);

          if (index > 0) {
            const prevItem = sortedStoryCommunities[index - 1];
            if (prevItem) {
              const prevSize = prevItem.size;
              const prevNormalizedSize = Math.sqrt(prevSize / 10);
              const prevSpacing = Math.min(
                maxSpacing,
                Math.max(
                  minSpacing,
                  baseSpacing + prevNormalizedSize * sizeMultiplier * width,
                ),
              );
              const prevRadius = Math.sqrt(prevSize);
              const prevX =
                communityTargetPositions.get(prevItem.communityId)?.x ?? currentX;
              currentX = prevX + prevRadius + prevSpacing / 4 + currentRadius;
            }
          }

          const targetX = currentX;
          storyCommunityXPositions.push(targetX);

          // Y軸: 上下交互に配置
          const isTop = order % 2 === 1;
          const topY = height * 0.2;
          const bottomY = height * 0.8;
          const targetY = isTop ? topY : bottomY;

          communityTargetPositions.set(communityId, { x: targetX, y: targetY });
        });

        // ストーリーに入っていないコミュニティを上下に配置
        const nonStoryCommunities = Array.from(communityGroups.entries()).filter(
          ([communityId]) => {
            const metaData = metaNodeData.find(
              (m) => m.communityId === communityId,
            );
            return !metaData?.order;
          },
        );

        const minStoryX =
          storyCommunityXPositions.length > 0
            ? Math.min(...storyCommunityXPositions)
            : width * 0.5;
        const maxStoryX =
          storyCommunityXPositions.length > 0
            ? Math.max(...storyCommunityXPositions)
            : width * 2.5;
        const storyXRange = maxStoryX - minStoryX || width * 2;

        nonStoryCommunities.forEach(([communityId], index) => {
          const normalizedIndex =
            nonStoryCommunities.length > 1
              ? index / (nonStoryCommunities.length - 1)
              : 0.5;
          const targetX = minStoryX + normalizedIndex * storyXRange;

          const isTop = index % 2 === 0;
          const targetY = isTop ? height * 0.1 : height * 1.4;

          communityTargetPositions.set(communityId, { x: targetX, y: targetY });
        });
      } else {
        // 縦向き: Y軸方向に進み、X軸方向に交互に配置（元の実装）
        const storyCommunityYPositions: number[] = [];

        const baseSpacing = height;
        const sizeMultiplier = 0.3;
        const minSpacing = height;
        const maxSpacing = height * 5;

        let currentY = height * 0.5;

        sortedStoryCommunities.forEach((item, index) => {
          const { communityId, nodes, order } = item;
          if (order === undefined) return;

          const communitySize = nodes.length;
          const currentRadius = Math.sqrt(communitySize);

          if (index > 0) {
            const prevItem = sortedStoryCommunities[index - 1];
            if (prevItem) {
              const prevSize = prevItem.size;
              const prevNormalizedSize = Math.sqrt(prevSize / 10);
              const prevSpacing = Math.min(
                maxSpacing,
                Math.max(
                  minSpacing,
                  baseSpacing + prevNormalizedSize * sizeMultiplier * height,
                ),
              );
              const prevRadius = Math.sqrt(prevSize);
              const prevY =
                communityTargetPositions.get(prevItem.communityId)?.y ?? currentY;
              currentY = prevY + prevRadius + prevSpacing / 4 + currentRadius;
            }
          }

          const targetY = currentY;
          storyCommunityYPositions.push(targetY);

          // X軸: 左右交互に配置
          const isLeft = order % 2 === 1;
          const leftX = width * 0.2;
          const rightX = width * 0.8;
          const targetX = isLeft ? leftX : rightX;

          communityTargetPositions.set(communityId, { x: targetX, y: targetY });
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

        const minStoryY =
          storyCommunityYPositions.length > 0
            ? Math.min(...storyCommunityYPositions)
            : height * 0.5;
        const maxStoryY =
          storyCommunityYPositions.length > 0
            ? Math.max(...storyCommunityYPositions)
            : height * 2.5;
        const storyYRange = maxStoryY - minStoryY || height * 2;

        nonStoryCommunities.forEach(([communityId], index) => {
          const normalizedIndex =
            nonStoryCommunities.length > 1
              ? index / (nonStoryCommunities.length - 1)
              : 0.5;
          const targetY = minStoryY + normalizedIndex * storyYRange;

          const isLeft = index % 2 === 0;
          const targetX = isLeft ? width * 0.1 : width * 1.4;

          communityTargetPositions.set(communityId, { x: targetX, y: targetY });
        });
      }
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
          .distance(50) // コミュニティ内のノードは近くに配置
          .strength((link) => {
            // エッジのsourceとtargetのコミュニティIDを取得
            const source = link.source as CustomNodeType;
            const target = link.target as CustomNodeType;
            const sourceCommunityId = communityMap?.[source.id];
            const targetCommunityId = communityMap?.[target.id];

            // コミュニティ間のエッジ（異なるコミュニティに属するノード間）の強度を下げる
            if (sourceCommunityId && targetCommunityId && sourceCommunityId !== targetCommunityId) {
              return 0.01; // コミュニティ間のエッジは弱い強度
            }

            // 同じコミュニティ内のエッジは通常の強度
            return 0.1;
          }),
      )
      .force("charge", forceManyBody().strength(-300)) // 弱い反発力
      .force("collide", forceCollide(30)) // 小さい衝突半径
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
    viewMode,
    originalGraphDocument,
    communityMap,
    width,
    height,
    detailedGraphLayout,
    metaNodeData, // order順の整列に必要
    layoutOrientation, // レイアウト方向
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
  }, [detailedGraphLayout, communityMap, onCommunityPositionsCalculated]);

  // メタグラフノードの生成（コミュニティ中心に固定）
  useEffect(() => {
    if (
      viewMode !== "meta" ||
      !filteredGraphDocument ||
      communityCenters.size === 0
    ) {
      setMetaGraphNodes([]);
      setMetaGraphLinks([]);
      return;
    }

    // メタグラフノードをコミュニティ中心座標に配置
    const metaNodes: CustomNodeType[] = filteredGraphDocument.nodes.map(
      (node) => {
        const center = communityCenters.get(node.id);
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
  }, [viewMode, filteredGraphDocument, communityCenters, width, height]);

  // 透明度を計算（セグメントフォーカス時は詳細グラフを最低でも見えるようにする）
  const rawDetailedOpacity = alwaysShowDetailedGraph
    ? 1.0
    : calculateOpacity(currentScale);
  const detailedGraphOpacity =
    isSegmentHighlightActive
      ? Math.max(rawDetailedOpacity, 0.85)
      : rawDetailedOpacity;
  // メタグラフの透明度は詳細グラフと逆相関（詳細が見える時はメタグラフを透明に）
  const metaGraphOpacity = alwaysShowDetailedGraph
    ? 0.3 // 常に表示モードの時はメタグラフも少し見えるようにする
    : 1 - detailedGraphOpacity;

  // メタグラフON時: セグメントフォーカス時に該当コミュニティへズームして詳細を見せる
  const segmentFocusZoomScale = 0.55;
  const segmentFocusCommunityId =
    focusedSegmentRef?.communityId ?? segmentSelectionEdit?.communityId;
  useEffect(() => {
    if (
      viewMode !== "meta" ||
      !segmentFocusCommunityId ||
      !communityCenters.size
    ) {
      return;
    }
    const center = communityCenters.get(segmentFocusCommunityId);
    if (!center) return;
    setCurrentScale(segmentFocusZoomScale);
    setCurrentTransformX(width / 2 - center.x * segmentFocusZoomScale);
    setCurrentTransformY(height / 2 - center.y * segmentFocusZoomScale);
  }, [viewMode, segmentFocusCommunityId, communityCenters, width, height]);

  // シミュレーション再実行ハンドラー
  const handleRerunSimulation = () => {
    setDetailedGraphLayout(null);
    setCommunityCenters(new Map());
  };

  // ストーリー編集モード時、metaNodeDataの変更を検知してシミュレーションを再実行
  useEffect(() => {
    if (!isEditMode || viewMode !== "meta" || !metaNodeData) {
      return;
    }

    // metaNodeDataのorder情報を文字列化して比較（変更検知用）
    // コミュニティIDとorderの組み合わせをソートして比較
    const orderKey = metaNodeData
      .map((m) => `${m.communityId}:${m.order ?? "undefined"}`)
      .sort()
      .join(",");

    // 長さも含めて比較（追加・削除も検知）
    const fullKey = `${metaNodeData.length}:${orderKey}`;

    if (prevMetaNodeDataOrderRef.current !== fullKey && prevMetaNodeDataOrderRef.current !== "") {
      // orderKeyが変更された場合、シミュレーションを再実行
      setDetailedGraphLayout(null);
      setCommunityCenters(new Map());
    }

    prevMetaNodeDataOrderRef.current = fullKey;
  }, [isEditMode, viewMode, metaNodeData]);

  return (
    <div className="relative h-full w-full">
      {/* シミュレーション再実行ボタン（メタグラフモードの時のみ表示） */}
      {viewMode === "meta" && (
        <>
          <Button
            onClick={() => setAlwaysShowDetailedGraph(!alwaysShowDetailedGraph)}
            className={`absolute right-14 top-4 z-10 !h-8 !w-8 !p-2 text-sm transition-colors ${alwaysShowDetailedGraph
              ? "bg-blue-600/50 hover:bg-blue-600/70"
              : "bg-transparent hover:bg-slate-50/10"
              }`}
          >
            <GraphIcon width={16} height={16} color="white" />
          </Button>
          <Button
            onClick={handleRerunSimulation}
            className="absolute right-4 top-4 z-10 !h-8 !w-8 bg-transparent !p-2 text-sm hover:bg-slate-50/10"
          >
            <ReloadIcon width={16} height={16} color="white" />
          </Button>
        </>
      )}
      <svg ref={svgRef} width={width} height={height} className="block">
        {/* グラデーション定義（MetaNode用） */}
        <defs>
          {viewMode === "meta" && (metaGraphNodes.length > 0 ? metaGraphNodes : filteredGraphDocument?.nodes ?? []).map((node) => {
            // highlight_nodesの設定に基づいてノードの色を決定
            let nodeColor: string | undefined = undefined;
            if (layoutInstruction?.forces?.highlight_nodes) {
              const { targetNodeIds, color } =
                layoutInstruction.forces.highlight_nodes;
              if (targetNodeIds.includes(node.id)) {
                nodeColor = color;
              }
            }

            if (
              viewMode === "meta" &&
              metaNodeData?.some(
                (m) => m.communityId === node.id && m.order !== undefined,
              )
            ) {
              nodeColor = "#2563eb";
            } else {
              nodeColor = "whitesmoke";
            }

            // フォーカス中のコミュニティをハイライト
            if (
              viewMode === "meta" &&
              focusedCommunityId &&
              node.id === focusedCommunityId
            ) {
              nodeColor = "#fbbf24"; // 黄色でハイライト
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
        <D3ZoomProvider
          svgRef={svgRef}
          currentScale={currentScale}
          setCurrentScale={setCurrentScale}
          currentTransformX={currentTransformX}
          setCurrentTransformX={setCurrentTransformX}
          currentTransformY={currentTransformY}
          setCurrentTransformY={setCurrentTransformY}
        >
          {/* Links */}
          <g className="links">
            {/* 詳細グラフのリンク（透明度制御） */}
            {viewMode === "meta" &&
              detailedGraphLayout &&
              (() => {
                // リンクフィルタが有効な場合、フィルタリングされたリンクのみを使用
                // メタグラフモードでは、詳細グラフのフィルタリングにはoriginalGraphDocumentを使用
                const linksToRender =
                  isLinkFiltered && originalGraphDocument
                    ? detailedGraphLayout.links.filter((link) => {
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
                    : detailedGraphLayout.links;

                // リンクの距離を計算して、最小・最大を取得
                const linkDistances = linksToRender
                  .map((link) => {
                    const source = link.source as CustomNodeType;
                    const target = link.target as CustomNodeType;
                    if (
                      !source ||
                      !target ||
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

                /** 同一ノード対ごとのエッジグループ（代表ラベル＋クリック展開用） */
                const linksByNodePair = new Map<string, CustomLinkType[]>();
                linksToRender.forEach((link) => {
                  if (!link.source || !link.target) return;
                  const key = getNodePairKey(link);
                  if (!linksByNodePair.has(key)) linksByNodePair.set(key, []);
                  linksByNodePair.get(key)!.push(link);
                });

                return (
                  <>
                    <g
                      className="detailed-graph-links"
                      opacity={detailedGraphOpacity}
                    >
                      {linksToRender.map((link, i) => {
                      const source = link.source as CustomNodeType;
                      const target = link.target as CustomNodeType;
                      if (
                        !source ||
                        !target ||
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

                      // リンクの距離を計算
                      const dx = target.x - source.x;
                      const dy = target.y - source.y;
                      const distance = Math.sqrt(dx * dx + dy * dy);

                      // 距離に応じて透明度を計算（距離が長いほど透明に）
                      // 最小距離: opacity 0.6, 最大距離: opacity 0.01
                      const normalizedDistance =
                        distanceRange > 0
                          ? (distance - minDistance) / distanceRange
                          : 0;
                      const opacity = 0.6 - normalizedDistance * 0.59; // 0.6から0.01まで

                      // セグメントフォーカス時: 該当エッジを黄色でハイライト、それ以外は暗くする
                      const edgeKey = getEdgeCompositeKeyFromLink(link);
                      const isSegmentEdge =
                        segmentHighlightEdgeIds.includes(edgeKey);
                      const linkStroke = isSegmentEdge ? "#fbbf24" : "#60a5fa";
                      const linkStrokeWidth = isSegmentEdge ? 2.5 : 1.5;
                      const effectiveOpacity =
                        isSegmentHighlightActive && !isSegmentEdge
                          ? opacity * 0.35
                          : opacity;
                      const isEdgeClickable =
                        !!segmentSelectionEdit && !!onSegmentEdgeToggle;

                      return (
                        <g
                          key={`detailed-${i}`}
                          onClick={
                            isEdgeClickable
                              ? () => onSegmentEdgeToggle(edgeKey)
                              : undefined
                          }
                          style={
                            isEdgeClickable
                              ? { cursor: "pointer" }
                              : undefined
                          }
                        >
                          <line
                            x1={source.x}
                            y1={source.y}
                            x2={target.x}
                            y2={target.y}
                            stroke={linkStroke}
                            strokeOpacity={effectiveOpacity}
                            strokeWidth={linkStrokeWidth}
                          />
                          {/* セグメントフォーカス時: ハイライトエッジに有向アニメーション（graph.tsx と同じ表現） */}
                          {isSegmentEdge && (
                            <line
                              x1={source.x}
                              y1={source.y}
                              x2={target.x}
                              y2={target.y}
                              stroke={linkStroke}
                              strokeWidth={linkStrokeWidth}
                              strokeOpacity={0.1}
                            >
                              <animate
                                attributeName="stroke-dasharray"
                                values="0,100;100,0;100,100"
                                dur="1.5s"
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="stroke-opacity"
                                values="0;0.6;0.6;0"
                                dur="1.5s"
                                repeatCount="indefinite"
                                keyTimes="0;0.01;0.1;1"
                              />
                            </line>
                          )}
                        </g>
                      );
                    })}
                    </g>
                    {/* エッジラベル（ノード対ごとに1つにまとめる） */}
                    {currentScale > 1.4 && (
                      <g
                        className="detailed-graph-edge-labels"
                        opacity={detailedGraphOpacity}
                      >
                        {Array.from(linksByNodePair.entries()).map(
                          ([pairKey, linksInPair]) => {
                            const link = linksInPair[0];
                            if (!link) return null;
                            const source = link.source as CustomNodeType;
                            const target = link.target as CustomNodeType;
                            if (
                              !source ||
                              !target ||
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
                            const typesInPair = linksInPair
                              .map((l) => l.type ?? "")
                              .filter(Boolean);
                            if (typesInPair.length === 0) return null;

                            const pairCount = linksInPair.length;
                            const dx = target.x - source.x;
                            const dy = target.y - source.y;
                            const rawAngleDeg =
                              (Math.atan2(dy, dx) * 180) / Math.PI;
                            /** ラベルが反転（上下逆）にならないよう角度を -90°〜90° にクランプ */
                            let angle = rawAngleDeg;
                            if (angle > 90) angle -= 180;
                            else if (angle < -90) angle += 180;
                            const labelX = (source.x + target.x) / 2;
                            const labelY = (source.y + target.y) / 2;
                            const labelTransform = `rotate(${angle}, ${labelX}, ${labelY})`;

                            const handleLabelClick =
                              pairCount > 1
                                ? (e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setExpandedEdgePairKey((prev) =>
                                      prev === pairKey ? null : pairKey,
                                    );
                                  }
                                : undefined;

                            return (
                              <text
                                key={`label-${pairKey}`}
                                x={labelX}
                                y={labelY}
                                textAnchor="middle"
                                fill="#93b0c7"
                                fontSize={5}
                                className={
                                  pairCount > 1
                                    ? "cursor-pointer select-none"
                                    : "pointer-events-none select-none"
                                }
                                transform={labelTransform}
                                onClick={handleLabelClick}
                              >
                                {expandedEdgePairKey === pairKey &&
                                pairCount > 1 ? (
                                  typesInPair.map((t, j) => (
                                    <tspan
                                      key={`${t}-${j}`}
                                      x={labelX}
                                      y={labelY}
                                      dy={j === 0 ? 0 : `${j * 1.2}em`}
                                    >
                                      {t}
                                    </tspan>
                                  ))
                                ) : pairCount > 1 ? (
                                  `${typesInPair[0]} …`
                                ) : (
                                  typesInPair[0]
                                )}
                              </text>
                            );
                          },
                        )}
                      </g>
                    )}
                  </>
                );
              })()}
            {/* メタグラフのリンク（詳細グラフが見える時は透明に） */}
            {viewMode === "meta" && metaGraphOpacity > 0 && (
              <g className="meta-graph-links" opacity={metaGraphOpacity}>
                {metaGraphLinks.map((link, i) => {
                  const source = link.source as CustomNodeType;
                  const target = link.target as CustomNodeType;
                  if (
                    !source ||
                    !target ||
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

                  // order付きのMetaNode間の隣接エッジかどうかを判定
                  const sourceMetaData = metaNodeData?.find(
                    (m) => m.communityId === source.id,
                  );
                  const targetMetaData = metaNodeData?.find(
                    (m) => m.communityId === target.id,
                  );

                  const isAdjacentOrderEdge =
                    sourceMetaData?.order !== undefined &&
                    targetMetaData?.order !== undefined &&
                    Math.abs(
                      (sourceMetaData.order ?? 0) - (targetMetaData.order ?? 0),
                    ) === 1;

                  // 隣接している場合は太く青色に、そうでない場合は通常のスタイル
                  const strokeColor = isAdjacentOrderEdge ? "#2563eb" : "#999";
                  const strokeWidth = isAdjacentOrderEdge ? 10 : 1;
                  const strokeOpacity = isAdjacentOrderEdge ? 0.9 : 0.6;

                  return (
                    <line
                      key={`meta-${i}`}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke={strokeColor}
                      strokeOpacity={strokeOpacity}
                      strokeWidth={strokeWidth}
                    />
                  );
                })}
              </g>
            )}
            {/* 通常モードのリンク */}
            {viewMode !== "meta" &&
              (() => {
                // リンクの距離を計算して、最小・最大を取得
                const linkDistances = graphLinks
                  .map((link) => {
                    const source = link.source as CustomNodeType;
                    const target = link.target as CustomNodeType;
                    if (
                      !source ||
                      !target ||
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

                /** 同一ノード対ごとのエッジグループ（代表ラベル＋クリック展開用） */
                const linksByNodePairNormal = new Map<
                  string,
                  CustomLinkType[]
                >();
                graphLinks.forEach((link) => {
                  if (!link.source || !link.target) return;
                  const key = getNodePairKey(link);
                  if (!linksByNodePairNormal.has(key))
                    linksByNodePairNormal.set(key, []);
                  linksByNodePairNormal.get(key)!.push(link);
                });

                return (
                  <g className="normal-graph-links-wrapper">
                    {graphLinks.map((link, i) => {
                  const source = link.source as CustomNodeType;
                  const target = link.target as CustomNodeType;
                  if (
                    !source ||
                    !target ||
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

                  // リンクの距離を計算
                  const dx = target.x - source.x;
                  const dy = target.y - source.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);

                  // 距離に応じて透明度を計算（距離が長いほど透明に）
                  // 最小距離: opacity 0.6, 最大距離: opacity 0.01
                  const normalizedDistance =
                    distanceRange > 0
                      ? (distance - minDistance) / distanceRange
                      : 0;
                  const opacity = 0.6 - normalizedDistance * 0.59; // 0.6から0.01まで

                  // 詳細ビューでもセグメントフォーカス時は該当エッジをハイライト
                  const edgeKey = getEdgeCompositeKeyFromLink(link);
                  const isSegmentEdge =
                    segmentHighlightEdgeIds.includes(edgeKey);
                  const stroke = isSegmentEdge ? "#fbbf24" : "#999";
                  const strokeWidth = isSegmentEdge ? 2.5 : 1;
                  const isEdgeClickableNormal =
                    !!segmentSelectionEdit && !!onSegmentEdgeToggle;

                  return (
                    <g
                      key={`normal-${i}`}
                      onClick={
                        isEdgeClickableNormal
                          ? () => onSegmentEdgeToggle(edgeKey)
                          : undefined
                      }
                      style={
                        isEdgeClickableNormal
                          ? { cursor: "pointer" }
                          : undefined
                      }
                    >
                      <line
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={stroke}
                        opacity={opacity}
                        strokeWidth={strokeWidth}
                      />
                      {/* セグメントフォーカス時: ハイライトエッジに有向アニメーション（graph.tsx と同じ表現） */}
                      {isSegmentEdge && (
                        <line
                          x1={source.x}
                          y1={source.y}
                          x2={target.x}
                          y2={target.y}
                          stroke={stroke}
                          strokeWidth={strokeWidth}
                          strokeOpacity={0.1}
                        >
                          <animate
                            attributeName="stroke-dasharray"
                            values="0,100;100,0;100,100"
                            dur="1.5s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="stroke-opacity"
                            values="0;0.6;0.6;0"
                            dur="1.5s"
                            repeatCount="indefinite"
                            keyTimes="0;0.01;0.1;1"
                          />
                        </line>
                      )}
                    </g>
                  );
                })}
                    {/* 通常モードのエッジラベル（ノード対ごとに1つにまとめる） */}
                    {currentScale > 1.4 && (
                      <g className="normal-graph-edge-labels">
                        {Array.from(linksByNodePairNormal.entries()).map(
                          ([pairKey, linksInPair]) => {
                            const link = linksInPair[0];
                            if (!link) return null;
                            const source = link.source as CustomNodeType;
                            const target = link.target as CustomNodeType;
                            if (
                              !source ||
                              !target ||
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
                            const typesInPair = linksInPair
                              .map((l) => l.type ?? "")
                              .filter(Boolean);
                            if (typesInPair.length === 0) return null;

                            const pairCount = linksInPair.length;
                            const dx = target.x - source.x;
                            const dy = target.y - source.y;
                            const rawAngleDeg =
                              (Math.atan2(dy, dx) * 180) / Math.PI;
                            /** ラベルが反転（上下逆）にならないよう角度を -90°〜90° にクランプ */
                            let angle = rawAngleDeg;
                            if (angle > 90) angle -= 180;
                            else if (angle < -90) angle += 180;
                            const labelX = (source.x + target.x) / 2;
                            const labelY = (source.y + target.y) / 2;
                            const labelTransform = `rotate(${angle}, ${labelX}, ${labelY})`;

                            const handleLabelClick =
                              pairCount > 1
                                ? (e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setExpandedEdgePairKey((prev) =>
                                      prev === pairKey ? null : pairKey,
                                    );
                                  }
                                : undefined;

                            return (
                              <text
                                key={`label-normal-${pairKey}`}
                                x={labelX}
                                y={labelY}
                                textAnchor="middle"
                                fill="#93b0c7"
                                fontSize={5}
                                className={
                                  pairCount > 1
                                    ? "cursor-pointer select-none"
                                    : "pointer-events-none select-none"
                                }
                                transform={labelTransform}
                                onClick={handleLabelClick}
                              >
                                {expandedEdgePairKey === pairKey &&
                                pairCount > 1 ? (
                                  typesInPair.map((t, j) => (
                                    <tspan
                                      key={`${t}-${j}`}
                                      x={labelX}
                                      y={labelY}
                                      dy={j === 0 ? 0 : `${j * 1.2}em`}
                                    >
                                      {t}
                                    </tspan>
                                  ))
                                ) : pairCount > 1 ? (
                                  `${typesInPair[0]} …`
                                ) : (
                                  typesInPair[0]
                                )}
                              </text>
                            );
                          },
                        )}
                      </g>
                    )}
                  </g>
                );
              })()}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {/* 詳細グラフのノード（透明度制御） */}
            {viewMode === "meta" && detailedGraphLayout && (
              <g
                className="detailed-graph-nodes"
                opacity={detailedGraphOpacity}
              >
                {(() => {
                  // リンクフィルタが有効な場合、フィルタリングされたノードのみを使用
                  // メタグラフモードでは、詳細グラフのフィルタリングにはoriginalGraphDocumentを使用
                  const nodesToRender =
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
                        return detailedGraphLayout.nodes.filter(
                          (node) =>
                            filteredNodeIds.has(node.id) &&
                            linkedNodeIds.has(node.id),
                        );
                      })()
                      : detailedGraphLayout.nodes;

                  return nodesToRender.map((node) => {
                    const queryFiltered =
                      !!nodeSearchQuery &&
                      nodeSearchQuery !== "" &&
                      node.name
                        .toLowerCase()
                        .includes(nodeSearchQuery.toLowerCase());

                    // ノードが属するコミュニティを取得
                    const nodeCommunityId = communityMap?.[node.id];

                    // ノードの色をコミュニティの状態に基づいて決定
                    let nodeColor: string | undefined = undefined;
                    // セグメントフォーカス時: 該当ノード（nodeIds）を黄色（communityMap に無くてもハイライト）
                    if (segmentHighlightNodeIds.includes(node.id)) {
                      nodeColor = "#fbbf24";
                    } else if (nodeCommunityId) {
                      // コミュニティ全体フォーカス時: フォーカス中のコミュニティに属するノードは黄色
                      if (
                        focusedCommunityId &&
                        nodeCommunityId === focusedCommunityId
                      ) {
                        nodeColor = "#fbbf24"; // 黄色
                      }
                      // ストーリーに含まれるコミュニティに属するノードは青（orderがあるコミュニティ）
                      else if (
                        metaNodeData?.some(
                          (m) =>
                            m.communityId === nodeCommunityId &&
                            m.order !== undefined,
                        )
                      ) {
                        nodeColor = "whitesmoke";
                      }
                      // その他のコミュニティに属するノードは薄い青
                      else {
                        nodeColor = "gray";
                      }
                    } else {
                      // コミュニティに属していないノードはデフォルト色
                      nodeColor = "gray";
                    }

                    // セグメントフォーカス時: 該当ノード以外は暗くしてハイライトを強調
                    const isSegmentFocusedNode =
                      segmentHighlightNodeIds.includes(node.id);

                    const nodeWrapperOpacity =
                      isSegmentHighlightActive && !isSegmentFocusedNode
                        ? 0.4
                        : 1;

                    const handleNodeClick =
                      segmentSelectionEdit && onSegmentNodeToggle
                        ? () => onSegmentNodeToggle(node.id)
                        : onNodeClick;

                    return (
                      <g
                        key={`detailed-${node.id}`}
                        opacity={nodeWrapperOpacity}
                        className="detailed-graph-node-wrapper"
                      >
                        <GenerativeGraphNode
                          node={node}
                          currentScale={currentScale}
                          onClick={handleNodeClick}
                          queryFiltered={queryFiltered}
                          nodeColor={nodeColor}
                          isMetaNode={false}
                        />
                      </g>
                    );
                  });
                })()}
              </g>
            )}
            {/* メタグラフのノード（詳細グラフが見える時は透明に） */}
            {viewMode === "meta" && metaGraphOpacity > 0 && (
              <g className="meta-graph-nodes" opacity={metaGraphOpacity}>
                {metaGraphNodes.map((node) => {
                  const queryFiltered =
                    !!nodeSearchQuery &&
                    nodeSearchQuery !== "" &&
                    node.name
                      .toLowerCase()
                      .includes(nodeSearchQuery.toLowerCase());

                  // highlight_nodesの設定に基づいてノードの色を決定
                  let nodeColor: string | undefined = undefined;
                  if (layoutInstruction?.forces?.highlight_nodes) {
                    const { targetNodeIds, color } =
                      layoutInstruction.forces.highlight_nodes;
                    if (targetNodeIds.includes(node.id)) {
                      nodeColor = color;
                    }
                  }

                  if (
                    viewMode === "meta" &&
                    metaNodeData?.some(
                      (m) => m.communityId === node.id && m.order !== undefined,
                    )
                  ) {
                    nodeColor = "#2563eb";
                  } else {
                    nodeColor = "#60a5fa";
                  }

                  // フォーカス中のコミュニティをハイライト
                  if (
                    viewMode === "meta" &&
                    focusedCommunityId &&
                    node.id === focusedCommunityId
                  ) {
                    nodeColor = "#fbbf24"; // 黄色でハイライト
                  }

                  const metaNodeSize = Number(
                    node.properties?.size ?? node.properties?.memberCount ?? 0,
                  );

                  // ストーリーの順番を取得
                  const storyOrder = metaNodeData?.find(
                    (m) => m.communityId === node.id,
                  )?.order;

                  return (
                    <GenerativeGraphNode
                      key={`meta-${node.id}`}
                      node={node}
                      currentScale={currentScale}
                      onClick={onNodeClick}
                      queryFiltered={queryFiltered}
                      nodeColor={nodeColor}
                      isMetaNode={true}
                      metaNodeSize={metaNodeSize}
                      storyOrder={storyOrder}
                      isEditMode={isEditMode}
                    />
                  );
                })}
              </g>
            )}
            {/* 通常モードのノード */}
            {viewMode !== "meta" &&
              graphNodes.map((node) => {
                const queryFiltered =
                  !!nodeSearchQuery &&
                  nodeSearchQuery !== "" &&
                  node.name
                    .toLowerCase()
                    .includes(nodeSearchQuery.toLowerCase());

                // highlight_nodesの設定に基づいてノードの色を決定
                let nodeColor: string | undefined = undefined;
                if (layoutInstruction?.forces?.highlight_nodes) {
                  const { targetNodeIds, color } =
                    layoutInstruction.forces.highlight_nodes;
                  if (targetNodeIds.includes(node.id)) {
                    nodeColor = color;
                  }
                }
                // メタグラフ OFF 時のみここが使われる。ON のときは「詳細グラフのノード」側でハイライト
                if (
                  !nodeColor &&
                  segmentHighlightNodeIds.includes(node.id)
                ) {
                  nodeColor = "#fbbf24";
                }

                const handleNormalNodeClick =
                  segmentSelectionEdit && onSegmentNodeToggle
                    ? () => onSegmentNodeToggle(node.id)
                    : onNodeClick;

                return (
                  <GenerativeGraphNode
                    key={node.id}
                    node={node}
                    currentScale={currentScale}
                    onClick={handleNormalNodeClick}
                    queryFiltered={queryFiltered}
                    nodeColor={nodeColor}
                    isMetaNode={false}
                  />
                );
              })}
          </g>
        </D3ZoomProvider>
      </svg>
    </div>
  );
};
