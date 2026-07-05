import type {
  FocusedPosition,
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
  type ForceLink,
} from "d3";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useTranslations } from "next-intl";
import { D3ZoomProvider } from "../zoom";
import type { TopicGraphFilterOption } from "@/app/const/types";
import {
  dragEditorExtension,
  type DragState,
} from "../extension/drag-editor-extension";
import { attachNodePositionDrag } from "../extension/node-position-drag-extension";

import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { MagnifierLens } from "../magnifier/magnifier-lens";
import { getMaxEdgeLabelFontSizeByLength } from "@/app/_utils/graph-label-utils";
import { useEdgeSemanticAnimation } from "./storytelling-graph/hooks/use-edge-semantic-animation";
import {
  CdtAnimatedEdgePath,
  CdtEdgeGlowFilterDef,
} from "./storytelling-graph/components/cdt-animated-edge-path";
import { GraphLinkEdgeSemanticPictogram } from "./graph-link-edge-semantic-pictogram";
import { useNodePairSemanticMotion } from "./storytelling-graph/hooks/use-node-pair-semantic-motion";
import {
  layoutPosWithNodePair,
  nodePairOffsetLayoutScale,
} from "@/app/const/edge-cdt-node-pair-animation";
import type { NodePairTransform } from "@/app/const/edge-cdt-node-pair-animation";

/** 同一ノード対のエッジをグループ化するキー（ソース・ターゲットの順序を正規化） */
function getNodePairKey(link: CustomLinkType): string {
  const a =
    typeof link.source === "object" && link.source !== null && "id" in link.source
      ? link.source.id
      : link.sourceId;
  const b =
    typeof link.target === "object" && link.target !== null && "id" in link.target
      ? link.target.id
      : link.targetId;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function getLinkEndpointIds(link: CustomLinkType): {
  sourceId: string;
  targetId: string;
} {
  const sourceId =
    typeof link.source === "object" && link.source !== null && "id" in link.source
      ? link.source.id
      : link.sourceId;
  const targetId =
    typeof link.target === "object" && link.target !== null && "id" in link.target
      ? link.target.id
      : link.targetId;
  return { sourceId, targetId };
}

function getVisibleByScaling(currentScale: number): number {
  if (currentScale > 4) return 0;
  if (currentScale > 3) return 0;
  if (currentScale > 2) return 4;
  if (currentScale > 1) return 6;
  if (currentScale > 0.9) return 8;
  return 10;
}

const isNodeFiltered = (
  node: CustomNodeType,
  filterOption?: TopicGraphFilterOption,
) => {
  if (!filterOption) return true;
  switch (filterOption.type) {
    case "label":
      return node.label.toLowerCase() === filterOption.value;
    case "tag":
      return node.properties.tag === filterOption.value;
  }
};

type GraphNodeCircleProps = {
  graphNode: CustomNodeType;
  /** 親レンダー時点の座標（in-place 更新でも memo が検知できるよう graphNode とは別 props） */
  nodeX: number;
  nodeY: number;
  isFocused: boolean;
  isSelected?: boolean;
  isPathNode: boolean;
  graphUnselected: boolean;
  queryFiltered: boolean;
  nodeMagnification: number;
  isDragEditorTarget: boolean;
  filterOption?: TopicGraphFilterOption;
  currentScale: number;
  isGraphFullScreen: boolean;
  isClustered: boolean;
  focusedNode: CustomNodeType | undefined;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  onNodeContextMenu?: (node: CustomNodeType) => void;
  graphIdentifier: string;
  nodeRef: React.RefObject<SVGSVGElement>;
  isSelectionMode?: boolean;
  onNodeSelectionToggle?: (node: CustomNodeType) => void;
  pairTransform?: NodePairTransform | null;
};

function graphNodeCirclePropsAreEqual(
  prev: GraphNodeCircleProps,
  next: GraphNodeCircleProps,
): boolean {
  const pn = prev.graphNode;
  const nn = next.graphNode;
  return (
    prev.nodeX === next.nodeX &&
    prev.nodeY === next.nodeY &&
    pn.visible === nn.visible &&
    pn.isAddedInHistory === nn.isAddedInHistory &&
    pn.isRemovedInHistory === nn.isRemovedInHistory &&
    pn.isMergeTarget === nn.isMergeTarget &&
    pn.isAdditional === nn.isAdditional &&
    pn.isExistingContext === nn.isExistingContext &&
    pn.nodeColor === nn.nodeColor &&
    pn.name === nn.name &&
    prev.isFocused === next.isFocused &&
    prev.isSelected === next.isSelected &&
    prev.isPathNode === next.isPathNode &&
    prev.graphUnselected === next.graphUnselected &&
    prev.queryFiltered === next.queryFiltered &&
    prev.nodeMagnification === next.nodeMagnification &&
    prev.isDragEditorTarget === next.isDragEditorTarget &&
    prev.currentScale === next.currentScale &&
    prev.isGraphFullScreen === next.isGraphFullScreen &&
    prev.isClustered === next.isClustered &&
    prev.focusedNode?.id === next.focusedNode?.id &&
    prev.isSelectionMode === next.isSelectionMode &&
    prev.filterOption === next.filterOption &&
    prev.pairTransform?.dx === next.pairTransform?.dx &&
    prev.pairTransform?.dy === next.pairTransform?.dy &&
    prev.pairTransform?.scale === next.pairTransform?.scale
  );
}

// ノード描画用のコンポーネント（メモ化）
const GraphNodeCircle = memo(function GraphNodeCircle({
  graphNode,
  nodeX,
  nodeY,
  isFocused,
  isSelected,
  isPathNode,
  graphUnselected,
  queryFiltered,
  nodeMagnification,
  isDragEditorTarget,
  filterOption,
  currentScale,
  isGraphFullScreen,
  isClustered,
  focusedNode,
  setFocusedNode,
  onNodeContextMenu,
  graphIdentifier,
  nodeRef,
  isSelectionMode,
  onNodeSelectionToggle,
  pairTransform,
}: GraphNodeCircleProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const baseR =
    1.6 *
    ((graphNode.neighborLinkCount ?? 0) * 0.1 + 3.6) *
    (isNodeFiltered(graphNode, filterOption) ? 1 : 0.5) *
    nodeMagnification;
  const imageUrl = graphNode.properties?.imageUrl as string | undefined;
  const showImage = !!imageUrl && !imageFailed;
  const r = showImage ? baseR * 1.25 : baseR;

  const fill =
    ((isSelectionMode && isSelected) ?? isFocused ?? isDragEditorTarget)
      ? "#ef7234"
      : isPathNode
        ? "#eae80c"
        : graphNode.isAddedInHistory
          ? "#10b981"
          : graphNode.isRemovedInHistory
            ? "#ef4444"
            : graphNode.isMergeTarget
              ? "#10b981"
              : graphNode.isAdditional
                ? "#8b9dc3"
                : graphUnselected
                  ? "#324557"
                  : isClustered && graphNode.nodeColor
                    ? graphNode.nodeColor
                    : "whitesmoke";
  const opacity =
    graphNode.isExistingContext
      ? 0.3
      : isNodeFiltered(graphNode, filterOption)
        ? 0.9
        : 0.6;
  const stroke =
    graphNode.isAddedInHistory
      ? "#10b981"
      : graphNode.isRemovedInHistory
        ? "#ef4444"
        : graphNode.isMergeTarget
          ? "#10b981"
          : "#eae80c";
  const strokeWidth =
    (graphNode.isAddedInHistory ??
      graphNode.isRemovedInHistory ??
      graphNode.isMergeTarget)
      ? 2.5
      : queryFiltered
        ? 2.5
        : 0;

  const pairLayoutScale = nodePairOffsetLayoutScale(currentScale);

  return (
    <g
      key={graphNode.id}
      ref={nodeRef}
      className={`${graphIdentifier}-node cursor-pointer`}
      transform={`translate(${nodeX + (pairTransform?.dx ?? 0) * pairLayoutScale}, ${nodeY + (pairTransform?.dy ?? 0) * pairLayoutScale})`}
      onClick={() => {
        if (isSelectionMode) {
          onNodeSelectionToggle?.(graphNode);
          return;
        }
        if (graphNode.id === focusedNode?.id) {
          setFocusedNode(undefined);
        } else {
          setFocusedNode(graphNode);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onNodeContextMenu?.(graphNode);
      }}
    >
      <g transform={pairTransform && pairTransform.scale !== 1 ? `scale(${pairTransform.scale})` : undefined}>
      {showImage ? (
        <>
          <defs>
            <clipPath id={`graph-node-image-clip-${graphNode.id}`}>
              <circle r={r} />
            </clipPath>
          </defs>
          <g clipPath={`url(#graph-node-image-clip-${graphNode.id})`}>
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
            stroke={fill}
            strokeWidth={strokeWidth || 1}
            data-node-id={graphNode.id}
            data-is-added={graphNode.isAddedInHistory}
            data-is-removed={graphNode.isRemovedInHistory}
          />
        </>
      ) : (
        <circle
          r={r}
          data-node-id={graphNode.id}
          data-is-added={graphNode.isAddedInHistory}
          data-is-removed={graphNode.isRemovedInHistory}
          fill={fill}
          opacity={opacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )}
      {(currentScale > 0.7 || isGraphFullScreen) && (
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={
            isFocused
              ? "whitesmoke"
              : queryFiltered
                ? "#eab000"
                : nodeMagnification >= 2.3
                  ? "#ef7234"
                  : isClustered
                    ? "whitesmoke"
                    : "dimgray"
          }
          fontSize={
            (currentScale > 4 ? 3 : currentScale > 4 ? 4 : 6) *
            nodeMagnification
          }
          fontWeight={nodeMagnification >= 2.3 ? "bold" : "normal"}
        >
          {graphNode.name}
        </text>
      )}
      </g>
    </g>
  );
}, graphNodeCirclePropsAreEqual);

const linkFilter = (nodes: CustomNodeType[], links: CustomLinkType[]) => {
  const connectedIds = new Set<string>();
  for (const link of links) {
    connectedIds.add(link.sourceId);
    connectedIds.add(link.targetId);
  }
  return nodes.filter((node) => connectedIds.has(node.id));
};

// const circlePosition = (index: number, length: number, type: "sin" | "cos") => {
//   const dig = index / length;
//   const radius = 400;
//   const angle = dig * Math.PI * 2;
//   return type === "sin" ? radius * Math.sin(angle) : radius * Math.cos(angle);
// };

export const D3ForceGraph = ({
  svgRef,
  height,
  width,
  graphDocument,
  selectedGraphData,
  selectedPathData,
  toolComponent,
  tagFilterOption: filterOption,
  nodeSearchQuery,
  isLinkFiltered = false,
  isClustered = false,
  isGraphFullScreen = false,
  isEditor = false,
  isLargeGraph,
  currentScale,
  setCurrentScale,
  focusedNode,
  setFocusedNode,
  focusedLink,
  setFocusedLink,
  onLinkContextMenu,
  onNodeContextMenu,
  onGraphUpdate,
  graphIdentifier = "graph",
  defaultPosition = {
    x: 0,
    y: 0,
  },
  isDirectedLinks = true,
  magnifierMode = 0,
  isSelectionMode,
  onNodeSelectionToggle,
  highlightData,
  showEdgeSemanticAnimation = false,
  topicSpaceId,
  enableLiveSimulation = false,
  enableNodeDrag,
}: {
  svgRef: React.RefObject<SVGSVGElement>;
  height: number;
  width: number;
  graphDocument: GraphDocumentForFrontend;
  selectedGraphData?: GraphDocumentForFrontend;
  selectedPathData?: GraphDocumentForFrontend;
  toolComponent?: React.ReactNode;
  tagFilterOption?: TopicGraphFilterOption;
  nodeSearchQuery?: string;
  currentScale: number;
  setCurrentScale: React.Dispatch<React.SetStateAction<number>>;
  isLinkFiltered?: boolean;
  isClustered?: boolean;
  isGraphFullScreen?: boolean;
  isEditor?: boolean;
  isLargeGraph: boolean;
  defaultPosition?: FocusedPosition;
  focusedNode: CustomNodeType | undefined;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  focusedLink: CustomLinkType | undefined;
  setFocusedLink: React.Dispatch<
    React.SetStateAction<CustomLinkType | undefined>
  >;
  onNodeContextMenu?: (node: CustomNodeType) => void;
  onLinkContextMenu?: (link: CustomLinkType) => void;
  onGraphUpdate?: (additionalGraph: GraphDocumentForFrontend) => void;
  graphIdentifier?: string;
  isDirectedLinks?: boolean;
  magnifierMode?: number;
  isSelectionMode?: boolean;
  onNodeSelectionToggle?: (node: CustomNodeType) => void;
  highlightData?: {
    addedNodeIds: Set<string>;
    removedNodeIds: Set<string>;
    addedLinkIds: Set<string>;
    removedLinkIds: Set<string>;
  };
  /** エッジ意味アニメーション（CDT分類 + ピクトグラム）の有効/無効 */
  showEdgeSemanticAnimation?: boolean;
  /** エッジ分類キャッシュに使用する TopicSpace ID */
  topicSpaceId?: string;
  /** true: 従来どおり force シミュレーションを常時稼働。false（デフォルト）: 収束後に固定配置 */
  enableLiveSimulation?: boolean;
  /** 固定配置時にノードをドラッグで移動可能にする（デフォルト: !enableLiveSimulation && !isEditor） */
  enableNodeDrag?: boolean;
}) => {
  const t = useTranslations("graph");
  const nodeDragEnabled = enableNodeDrag ?? (!enableLiveSimulation && !isEditor);
  const { nodes, relationships } = graphDocument;
  const initLinks = relationships as CustomLinkType[];
  const initNodes = isLinkFiltered ? linkFilter(nodes, initLinks) : nodes;

  // ハイライト情報は後で適用するため、initNodesとnewLinksはhighlightDataに依存しない
  const newLinks = useMemo(() => {
    const nodeById = new Map(initNodes.map((node) => [node.id, node]));
    return initLinks.map((d) => {
      const source = nodeById.get(d.sourceId) as CustomNodeType;
      const target = nodeById.get(d.targetId) as CustomNodeType;
      return {
        ...d,
        source,
        target,
      };
    });
  }, [initLinks, initNodes]);

  /** 分類対象はフォーカス中のエッジ1本のみ（LLM負荷抑制） */
  const linksForEdgeSemanticAnimation = useMemo(() => {
    if (!focusedLink?.id || !focusedLink.type) return [];
    const link = newLinks.find((l) => l.id === focusedLink.id);
    return link ? [link] : [];
  }, [focusedLink, newLinks]);

  const { getEdgeMotionConfig } = useEdgeSemanticAnimation({
    links: linksForEdgeSemanticAnimation,
    enabled: showEdgeSemanticAnimation,
    topicSpaceId,
  });

  const { getNodePairTransform } = useNodePairSemanticMotion({
    enabled: showEdgeSemanticAnimation,
    links: linksForEdgeSemanticAnimation,
    getEdgeMotionConfig,
  });

  const [currentTransformX, setCurrentTransformX] = useState<number>(
    defaultPosition.x,
  );
  const [currentTransformY, setCurrentTransformY] = useState<number>(
    defaultPosition.y,
  );
  const [graphNodes, setGraphNodes] = useState<CustomNodeType[]>(initNodes);
  const [graphLinks, setGraphLinks] = useState<CustomLinkType[]>(newLinks);

  // highlightDataが変更されたら、既存のノードとリンクのプロパティを更新
  // （D3のシミュレーションをリセットしないように、状態を置き換えずにプロパティのみ更新）
  useEffect(() => {
    if (!highlightData) {
      // highlightDataがない場合は、プロパティをクリア
      setGraphNodes((prevNodes) => {
        prevNodes.forEach((node) => {
          node.isAddedInHistory = false;
          node.isRemovedInHistory = false;
        });
        return [...prevNodes];
      });
      setGraphLinks((prevLinks) => {
        prevLinks.forEach((link) => {
          link.isAddedInHistory = false;
          link.isRemovedInHistory = false;
        });
        return [...prevLinks];
      });
      return;
    }

    // 既存のノードとリンクのプロパティのみを更新（参照は維持してリンク位置を同期）
    setGraphNodes((prevNodes) => {
      prevNodes.forEach((node) => {
        node.isAddedInHistory = highlightData.addedNodeIds.has(node.id);
        node.isRemovedInHistory = highlightData.removedNodeIds.has(node.id);
      });
      return [...prevNodes];
    });

    setGraphLinks((prevLinks) => {
      prevLinks.forEach((link) => {
        link.isAddedInHistory = highlightData.addedLinkIds.has(link.id);
        link.isRemovedInHistory = highlightData.removedLinkIds.has(link.id);
      });
      return [...prevLinks];
    });
  }, [highlightData]);

  const [nodesInMagnifier, setNodesInMagnifier] = useState<string[]>([]);
  const [linksInMagnifier, setLinksInMagnifier] = useState<string[]>([]);
  const nodesInMagnifierSet = useMemo(
    () => new Set(nodesInMagnifier),
    [nodesInMagnifier],
  );
  const linksInMagnifierSet = useMemo(
    () => new Set(linksInMagnifier),
    [linksInMagnifier],
  );
  /** クリックでラベルを垂直展開したノード対キー（null で閉じる） */
  const [expandedEdgePairKey, setExpandedEdgePairKey] = useState<string | null>(
    null,
  );
  const [nodeMagnifications, setNodeMagnifications] = useState<
    Map<string, number>
  >(new Map());
  const [linkMagnifications, setLinkMagnifications] = useState<
    Map<string, number>
  >(new Map());
  const tempLineRef = useRef<SVGLineElement>(null);
  const tempCircleRef = useRef<SVGCircleElement>(null);
  const nodeRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    sourceNode: null,
    targetNode: null,
  });

  // ノードのMapをメモ化してO(1)検索を可能にする
  // graphNodesが更新されたらnodeMapも更新する
  const nodeMap = useMemo(() => {
    const map = new Map<string, CustomNodeType>();
    graphNodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [graphNodes]);

  // selectedPathDataのノードIDとリンクIDのSetをメモ化
  const pathNodeIds = useMemo(
    () => new Set(selectedPathData?.nodes.map((node) => node.id) ?? []),
    [selectedPathData?.nodes],
  );
  const pathLinkIds = useMemo(
    () => new Set(selectedPathData?.relationships.map((r) => r.id) ?? []),
    [selectedPathData?.relationships],
  );

  // selectedGraphDataのノード名とリンクIDのSetをメモ化
  const selectedNodeNames = useMemo(
    () => new Set(selectedGraphData?.nodes.map((node) => node.name) ?? []),
    [selectedGraphData?.nodes],
  );
  const selectedLinkIds = useMemo(
    () => new Set(selectedGraphData?.relationships.map((r) => r.id) ?? []),
    [selectedGraphData?.relationships],
  );
  const selectedLinkSourceTargetPairs = useMemo(
    () =>
      new Set(
        selectedGraphData?.relationships.map(
          (r) => `${r.sourceId}-${r.targetId}`,
        ) ?? [],
      ),
    [selectedGraphData?.relationships],
  );

  // ノードの可視性情報をメモ化
  const nodeVisibilityMap = useMemo(() => {
    const map = new Map<
      string,
      {
        isFocused: boolean;
        isPathNode: boolean;
        queryFiltered: boolean;
        nodeMagnification: number;
      }
    >();
    graphNodes.forEach((graphNode) => {
      const isFocused = graphNode.id === focusedNode?.id;
      const isPathNode = pathNodeIds.has(graphNode.id);
      const queryFiltered =
        !!nodeSearchQuery &&
        nodeSearchQuery !== "" &&
        graphNode.name.toLowerCase().includes(nodeSearchQuery.toLowerCase());
      const isInMagnifier = nodesInMagnifierSet.has(graphNode.id);
      const nodeMagnification = isInMagnifier
        ? (nodeMagnifications.get(graphNode.id) ?? 1)
        : 1;

      map.set(graphNode.id, {
        isFocused,
        isPathNode,
        queryFiltered,
        nodeMagnification,
      });
    });
    return map;
  }, [
    graphNodes,
    focusedNode,
    pathNodeIds,
    nodeSearchQuery,
    nodesInMagnifierSet,
    nodeMagnifications,
  ]);

  // リンクの拡大率情報をメモ化
  const linkMagnificationMap = useMemo(() => {
    const map = new Map<string, number>();
    graphLinks.forEach((link) => {
      const isInMagnifier = linksInMagnifierSet.has(link.id);
      map.set(
        link.id,
        isInMagnifier ? (linkMagnifications.get(link.id) ?? 1) : 1,
      );
    });
    return map;
  }, [graphLinks, linksInMagnifierSet, linkMagnifications]);

  /** 同一ノード対ごとのエッジグループ（代表ラベル＋クリック展開用） */
  const linksByNodePair = useMemo(() => {
    const map = new Map<string, CustomLinkType[]>();
    graphLinks.forEach((link) => {
      const key = getNodePairKey(link);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(link);
    });
    return map;
  }, [graphLinks]);

  // アニメーションフレームのスロットリング用
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const simulationRef = useRef<ReturnType<
    typeof forceSimulation<CustomNodeType, CustomLinkType>
  > | null>(null);
  const layoutSettledRef = useRef(false);
  const simulationDataKeyRef = useRef("");
  const layoutDimensionsRef = useRef({ width: 0, height: 0 });
  const initNodesMapRef = useRef<Map<string, CustomNodeType>>(new Map());
  const [isLayoutSettled, setIsLayoutSettled] = useState(false);
  const nodeCount = initNodes.length;
  const tickThrottleMs = nodeCount > 1000 ? 32 : nodeCount > 500 ? 24 : 16;

  const simulationDataKey = useMemo(
    () =>
      `${initNodes.length}:${initLinks.length}:${isClustered}:${enableLiveSimulation}`,
    [initNodes.length, initLinks.length, isClustered, enableLiveSimulation],
  );
  const hasValidDimensions = width > 0 && height > 0;

  useEffect(() => {
    initNodesMapRef.current = new Map(initNodes.map((node) => [node.id, node]));
  }, [initNodes]);

  // graphNodesとgraphLinksの最新の状態をrefで保持して、updateGraph内で参照できるようにする
  const graphNodesRef = useRef<CustomNodeType[]>(graphNodes);
  const graphLinksRef = useRef<CustomLinkType[]>(graphLinks);
  const nodeMapRef = useRef<Map<string, CustomNodeType>>(new Map());

  // graphNodesとgraphLinksが変更されたらrefを更新
  useEffect(() => {
    graphNodesRef.current = graphNodes;
    const map = new Map<string, CustomNodeType>();
    graphNodes.forEach((node) => map.set(node.id, node));
    nodeMapRef.current = map;
  }, [graphNodes]);

  useEffect(() => {
    graphLinksRef.current = graphLinks;
  }, [graphLinks]);

  // MagnifierLensのコールバック関数をメモ化
  const handleNodesInMagnifierChange = useCallback(
    (nodeIds: string[], magnifications: Map<string, number>) => {
      setNodesInMagnifier(nodeIds);
      setNodeMagnifications(magnifications);
    },
    [],
  );

  const handleLinksInMagnifierChange = useCallback(
    (linkIds: string[], magnifications: Map<string, number>) => {
      setLinksInMagnifier(linkIds);
      setLinkMagnifications(magnifications);
    },
    [],
  );

  const distance = (d: CustomLinkType) => {
    return !!d.properties.distance ? Number(d.properties.distance) : 0;
  };

  // ルーペモードがOFFになった時に拡大状態をリセット
  useEffect(() => {
    if (magnifierMode === 0) {
      setNodesInMagnifier([]);
      setLinksInMagnifier([]);
      setNodeMagnifications(new Map());
      setLinkMagnifications(new Map());
    }
  }, [magnifierMode]);

  // magnifierModeに応じて半径を決定
  const magnifierRadius =
    magnifierMode === 1 ? 150 : magnifierMode === 2 ? 250 : 0;

  // ズーム変更時はノード可視性のみ更新（シミュレーションは再起動しない）
  useEffect(() => {
    const visibleByScaling = getVisibleByScaling(currentScale);
    setGraphNodes((prev) => {
      let changed = false;
      prev.forEach((node) => {
        const nextVisible =
          isGraphFullScreen ||
          !(isLargeGraph && (node.neighborLinkCount ?? 0) <= visibleByScaling);
        if (node.visible !== nextVisible) {
          node.visible = nextVisible;
          changed = true;
        }
      });
      return changed ? [...prev] : prev;
    });
  }, [currentScale, isGraphFullScreen, isLargeGraph]);

  useEffect(() => {
    // width/heightが無効な値の場合はシミュレーションを初期化しない
    if (width <= 0 || height <= 0 || !initNodes.length || !newLinks.length) {
      return;
    }

    // レイアウト確定済みかつグラフデータ不変なら再シミュレーションしない（サイズ変更は別 effect で平行移動）
    if (
      layoutSettledRef.current &&
      simulationDataKeyRef.current === simulationDataKey &&
      !enableLiveSimulation
    ) {
      return;
    }

    simulationDataKeyRef.current = simulationDataKey;
    layoutSettledRef.current = false;
    setIsLayoutSettled(false);
    lastUpdateTimeRef.current = 0;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const centerX = width / 2;
    const centerY = height / 2;

    for (const node of initNodes) {
      const simNode = node as CustomNodeType;
      simNode.fx = null;
      simNode.fy = null;
    }

    const simulation = forceSimulation<CustomNodeType, CustomLinkType>(
      initNodes,
    )
      .force(
        "link",
        forceLink<CustomNodeType, CustomLinkType>(newLinks)
          .id((d) => d.id)
          .distance(
            (d) =>
              45 *
              (distance(d) * distance(d) * distance(d) * distance(d) * 3 || 1),
          )
          .strength((d) => 0.125 / (distance(d) * distance(d) || 1)),
      )
      .force("center", forceCenter(centerX, centerY));
    const chargeForce = forceManyBody().strength(-40);
    if (nodeCount > 500) {
      chargeForce.distanceMax(400);
    }
    simulation
      .force("charge", chargeForce)
      .force(
        "x",
        forceX().x(function (d) {
          const nodeData = d as CustomNodeType;
          const node = initNodesMapRef.current.get(nodeData.id);
          return (
            centerX + (isClustered && node?.clustered?.x ? node.clustered.x : 0)
          );
        }),
      )
      .force(
        "y",
        forceY().y(function (d) {
          const nodeData = d as CustomNodeType;
          const node = initNodesMapRef.current.get(nodeData.id);
          return (
            centerY + (isClustered && node?.clustered?.y ? node.clustered.y : 0)
          );
        }),
      )
      .force("collision", forceCollide(1));

    setGraphLinks(newLinks);

    simulationRef.current = simulation;
    simulation.alpha(0.5);

    if (enableLiveSimulation) {
      simulation.alphaDecay(0.0228);
      simulation.alphaMin(0.001);
    } else {
      simulation.alphaDecay(nodeCount > 1000 ? 0.08 : nodeCount > 500 ? 0.05 : 0.028);
      simulation.alphaMin(0.01);
    }
    simulation.alphaTarget(0);

    const visibleByScaling = getVisibleByScaling(currentScale);

    const syncNodeVisualProps = (node: CustomNodeType) => {
      const currentGraphNode = graphNodesRef.current.find((n) => n.id === node.id);
      if (!currentGraphNode) return;
      node.isAddedInHistory = currentGraphNode.isAddedInHistory;
      node.isRemovedInHistory = currentGraphNode.isRemovedInHistory;
      node.isAdditional = currentGraphNode.isAdditional;
      node.isExistingContext = currentGraphNode.isExistingContext;
      node.isMergeTarget = currentGraphNode.isMergeTarget;
      node.nodeColor = currentGraphNode.nodeColor;
    };

    const updateGraph = () => {
      const currentNodes = simulation.nodes();
      const updateTime = performance.now();

      for (const node of currentNodes) {
        syncNodeVisualProps(node);
        node.visible =
          isGraphFullScreen ||
          !(isLargeGraph && (node.neighborLinkCount ?? 0) <= visibleByScaling);
      }

      setGraphNodes([...currentNodes]);
      lastUpdateTimeRef.current = updateTime;
    };

    const settleLayout = () => {
      const currentNodes = simulation.nodes();
      for (const node of currentNodes) {
        syncNodeVisualProps(node);
        node.visible =
          isGraphFullScreen ||
          !(isLargeGraph && (node.neighborLinkCount ?? 0) <= visibleByScaling);
        if (node.x != null && node.y != null) {
          node.fx = node.x;
          node.fy = node.y;
        }
      }
      setGraphNodes([...currentNodes]);
      const linkForce = simulation.force("link")!;
      setGraphLinks([...(linkForce as ForceLink<CustomNodeType, CustomLinkType>).links()]);
      layoutSettledRef.current = true;
      layoutDimensionsRef.current = { width, height };
      setIsLayoutSettled(true);
      simulation.stop();
    };

    simulation.on("tick", () => {
      const now = performance.now();
      const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

      if (
        timeSinceLastUpdate >= tickThrottleMs ||
        lastUpdateTimeRef.current === 0
      ) {
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = requestAnimationFrame(() => {
          animationFrameRef.current = null;
          updateGraph();
        });
      } else if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(() => {
          animationFrameRef.current = null;
          updateGraph();
        });
      }
    });

    simulation.on("end", () => {
      if (enableLiveSimulation) {
        if (simulation.alpha() < simulation.alphaMin()) {
          simulation.alpha(0.3);
          simulation.restart();
        }
        return;
      }
      settleLayout();
    });

    if (isEditor && !!onGraphUpdate && !!dragState) {
      dragEditorExtension({
        tempLineRef,
        tempCircleRef,
        simulation,
        graphDocument,
        dragState,
        setDragState,
        onGraphUpdate,
        graphIdentifier,
        formatNewNodeName: (id) => t("newNodeName", { id }),
      });
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      simulation.stop();
      simulationRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    simulationDataKey,
    newLinks,
    initNodes,
    hasValidDimensions,
    isGraphFullScreen,
    isLargeGraph,
    enableLiveSimulation,
    nodeCount,
    tickThrottleMs,
  ]);

  // レイアウト確定後のサイズ変更は再シミュレーションせず、中心に合わせて平行移動
  useEffect(() => {
    if (!layoutSettledRef.current || width <= 0 || height <= 0) return;

    const prev = layoutDimensionsRef.current;
    if (prev.width <= 0 || prev.height <= 0) {
      layoutDimensionsRef.current = { width, height };
      return;
    }
    if (prev.width === width && prev.height === height) return;

    const dx = width / 2 - prev.width / 2;
    const dy = height / 2 - prev.height / 2;
    layoutDimensionsRef.current = { width, height };
    if (dx === 0 && dy === 0) return;

    setGraphNodes((prevNodes) => {
      prevNodes.forEach((node) => {
        if (node.x != null) node.x += dx;
        if (node.y != null) node.y += dy;
        if (node.fx != null) node.fx += dx;
        if (node.fy != null) node.fy += dy;
      });
      return [...prevNodes];
    });
  }, [width, height]);

  const handleNodeDragPositionChange = useCallback(() => {
    setGraphNodes((prev) => [...prev]);
  }, []);

  useEffect(() => {
    if (!nodeDragEnabled || !isLayoutSettled || isEditor) return;

    const cleanup = attachNodePositionDrag({
      graphIdentifier,
      nodeMapRef,
      onPositionChange: handleNodeDragPositionChange,
      enabled: true,
    });

    return cleanup;
  }, [
    nodeDragEnabled,
    isLayoutSettled,
    isEditor,
    graphIdentifier,
    graphNodes.length,
    handleNodeDragPositionChange,
  ]);

  return (
    <div className="flex flex-col">
      <div className={`h-[${String(height)}px] w-[${String(width)}px]`}>
        {toolComponent}
        {nodes.length === 0 && relationships.length === 0 ? (
          <div className="mt-60 flex flex-col items-center">
            <div>
              <span translate="yes">{t("noData")}</span>
            </div>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${String(width)} ${String(height)}`}
          >
            <D3ZoomProvider
              svgRef={svgRef}
              setCurrentScale={setCurrentScale}
              setCurrentTransformX={setCurrentTransformX}
              setCurrentTransformY={setCurrentTransformY}
              currentScale={currentScale}
              currentTransformX={currentTransformX}
              currentTransformY={currentTransformY}
            >
              {showEdgeSemanticAnimation && (
                <defs>
                  <CdtEdgeGlowFilterDef />
                </defs>
              )}
              {graphLinks.map((graphLink, linkIndex) => {
                const { sourceId, targetId } = getLinkEndpointIds(graphLink);
                const { type } = graphLink;
                const sourceNode = nodeMap.get(sourceId);
                const targetNode = nodeMap.get(targetId);
                if (
                  !sourceNode ||
                  !targetNode ||
                  sourceNode.x == null ||
                  targetNode.x == null ||
                  sourceNode.y == null ||
                  targetNode.y == null
                ) {
                  return null;
                }
                const isFocused = graphLink.id === focusedLink?.id;
                const isPathLink = pathLinkIds.has(graphLink.id);
                const isSelectedLink =
                  selectedLinkIds.has(graphLink.id) ||
                  selectedLinkSourceTargetPairs.has(`${sourceId}-${targetId}`);
                const linkMagnification =
                  linkMagnificationMap.get(graphLink.id) ?? 1;
                const cdtMotionConfig =
                  showEdgeSemanticAnimation && isFocused
                    ? getEdgeMotionConfig(graphLink.id)
                    : null;

                const sourceNodeVisible = sourceNode.visible ?? false;
                const targetNodeVisible = targetNode.visible ?? false;

                if (sourceNodeVisible || targetNodeVisible) {
                  const isGradient = sourceNodeVisible !== targetNodeVisible;

                  const srcPair = showEdgeSemanticAnimation
                    ? getNodePairTransform(sourceId)
                    : null;
                  const tgtPair = showEdgeSemanticAnimation
                    ? getNodePairTransform(targetId)
                    : null;
                  const pairLayoutScale = nodePairOffsetLayoutScale(currentScale);
                  const srcPos = layoutPosWithNodePair(
                    sourceNode.x ?? 0,
                    sourceNode.y ?? 0,
                    srcPair,
                    pairLayoutScale,
                  );
                  const tgtPos = layoutPosWithNodePair(
                    targetNode.x ?? 0,
                    targetNode.y ?? 0,
                    tgtPair,
                    pairLayoutScale,
                  );

                  return (
                    <g
                      className="link cursor-pointer"
                      key={`link-${linkIndex}-${graphLink.id ?? `${sourceId}-${type}-${targetId}`}`}
                      onClick={() => {
                        if (graphLink.id === focusedLink?.id) {
                          setFocusedLink(undefined);
                        } else {
                          setFocusedLink(graphLink);
                        }
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onLinkContextMenu?.(graphLink);
                      }}
                    >
                      {cdtMotionConfig ? (
                        <CdtAnimatedEdgePath
                          pathD={`M ${srcPos.x} ${srcPos.y} L ${tgtPos.x} ${tgtPos.y}`}
                          motionConfig={cdtMotionConfig}
                          strokeWidth={
                            ((graphLink.isAddedInHistory ??
                              graphLink.isRemovedInHistory)
                              ? 2.5
                              : 2) *
                            linkMagnification *
                            1.5
                          }
                          strokeOpacity={1}
                          steadyAnimate
                        />
                      ) : (
                        <line
                          stroke={
                            isFocused
                              ? "#ef7234"
                              : isSelectionMode && isSelectedLink
                                ? "#ef7234"
                                : graphLink.isAddedInHistory
                                  ? "#10b981" // 変更履歴で追加されたエッジは緑色
                                  : graphLink.isRemovedInHistory
                                    ? "#ef4444" // 変更履歴で削除されたエッジは赤色
                                    : isPathLink
                                      ? "#eae80c"
                                      : graphLink.isAdditional
                                        ? "#3769d4"
                                        : "white"
                          }
                          data-link-id={graphLink.id}
                          data-is-added={graphLink.isAddedInHistory}
                          data-is-removed={graphLink.isRemovedInHistory}
                          strokeOpacity={
                            (graphLink.isAddedInHistory ??
                              graphLink.isRemovedInHistory)
                              ? 0.8 // ハイライトエッジは少し濃く
                              : isFocused
                                ? 1
                                : isSelectionMode && isSelectedLink
                                  ? 0.9
                                  : graphLink.isExistingContext
                                    ? 0.2 // 既存グラフのコンテキストエッジは薄く
                                    : isGradient
                                      ? 0.04
                                      : (distance(graphLink) ? 0.6 : 0.4) /
                                      (distance(graphLink) *
                                        distance(graphLink) || 1)
                          }
                          strokeWidth={
                            (graphLink.isAddedInHistory ??
                              graphLink.isRemovedInHistory)
                              ? 2.5 // ハイライトエッジは太く
                              : (isFocused || (isSelectionMode && isSelectedLink)
                                ? 2
                                : 1.2) *
                              linkMagnification *
                              1.5
                          }
                          x1={srcPos.x}
                          y1={srcPos.y}
                          x2={tgtPos.x}
                          y2={tgtPos.y}
                        />
                      )}
                      {isDirectedLinks && (
                        <g>
                          <line
                            stroke={"orange"}
                            strokeWidth={(isFocused ? 2 : 1.2) * 1.5}
                            strokeOpacity={0.1}
                            x1={srcPos.x}
                            y1={srcPos.y}
                            x2={tgtPos.x}
                            y2={tgtPos.y}
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
                        </g>
                      )}

                      {showEdgeSemanticAnimation && (
                        <GraphLinkEdgeSemanticPictogram
                          graphLink={graphLink}
                          getEdgeMotionConfig={getEdgeMotionConfig}
                          displayScale={currentScale}
                          getNodePairTransform={getNodePairTransform}
                        />
                      )}
                    </g>
                  );
                }
              })}
              {/* エッジラベル（ノード対ごとに1つ、展開・縮小可能） */}
              {currentScale > 3.5 &&
                Array.from(linksByNodePair.entries()).map(
                  ([pairKey, linksInPair]) => {
                    const link = linksInPair[0];
                    if (!link) return null;
                    const { sourceId, targetId } = getLinkEndpointIds(link);
                    const sourceNode = nodeMap.get(sourceId);
                    const targetNode = nodeMap.get(targetId);
                    if (
                      !sourceNode ||
                      !targetNode ||
                      sourceNode.x == null ||
                      targetNode.x == null ||
                      sourceNode.y == null ||
                      targetNode.y == null
                    ) {
                      return null;
                    }
                    const sourceNodeVisible = sourceNode.visible ?? false;
                    const targetNodeVisible = targetNode.visible ?? false;
                    if (!sourceNodeVisible && !targetNodeVisible) return null;

                    const pairCount = linksInPair.length;
                    const typesInPair = linksInPair
                      .map((l) => l.type ?? "")
                      .filter(Boolean);
                    if (typesInPair.length === 0) return null;

                    const srcPair = showEdgeSemanticAnimation
                      ? getNodePairTransform(sourceId)
                      : null;
                    const tgtPair = showEdgeSemanticAnimation
                      ? getNodePairTransform(targetId)
                      : null;
                    const pairLayoutScale = nodePairOffsetLayoutScale(currentScale);
                    const srcPos = layoutPosWithNodePair(
                      sourceNode.x ?? 0,
                      sourceNode.y ?? 0,
                      srcPair,
                      pairLayoutScale,
                    );
                    const tgtPos = layoutPosWithNodePair(
                      targetNode.x ?? 0,
                      targetNode.y ?? 0,
                      tgtPair,
                      pairLayoutScale,
                    );
                    const labelX = (srcPos.x + tgtPos.x) / 2;
                    const labelY = (srcPos.y + tgtPos.y) / 2;
                    const dx = tgtPos.x - srcPos.x;
                    const dy = tgtPos.y - srcPos.y;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    const labelTextLength =
                      expandedEdgePairKey === pairKey && pairCount > 1
                        ? Math.max(...typesInPair.map((t) => t.length))
                        : pairCount > 1
                          ? (typesInPair[0]?.length ?? 0) + 3
                          : typesInPair[0]?.length ?? 1;
                    const baseFontSize = 2.5;
                    const maxFontSizeByEdge = getMaxEdgeLabelFontSizeByLength(
                      len,
                      labelTextLength,
                    );
                    const effectiveFontSize = Math.max(
                      2,
                      Math.min(baseFontSize, maxFontSizeByEdge),
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

                    return (
                      <g
                        key={`edge-label-${pairKey}`}
                        className={
                          pairCount > 1 ? "cursor-pointer" : "pointer-events-none"
                        }
                        onClick={handleLabelClick}
                      >
                        <text
                          x={labelX}
                          y={labelY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="darkgray"
                          fontSize={effectiveFontSize}
                        >
                          {expandedEdgePairKey === pairKey && pairCount > 1 ? (
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
                      </g>
                    );
                  },
                )}
              {/* 通常のノードを描画 */}
              {graphNodes
                .filter((graphNode) => {
                  const visibility = nodeVisibilityMap.get(graphNode.id);
                  if (!visibility) return false;
                  return (
                    ((graphNode.visible ?? false) ||
                      visibility.queryFiltered ||
                      visibility.isFocused ||
                      visibility.isPathNode) &&
                    visibility.nodeMagnification < 2.3
                  );
                })
                .map((graphNode) => {
                  const visibility = nodeVisibilityMap.get(graphNode.id);
                  if (!visibility) return null;
                  // selectedGraphDataが存在する場合のみ、選択されていないノードを暗く表示
                  const graphUnselected = selectedGraphData
                    ? !selectedNodeNames.has(graphNode.name)
                    : false;
                  const isDragEditorTarget =
                    isEditor &&
                    dragState.isDragging &&
                    (dragState.targetNode?.id === graphNode.id ||
                      dragState.sourceNode?.id === graphNode.id);

                  return (
                    <GraphNodeCircle
                      key={graphNode.id}
                      graphNode={graphNode}
                      nodeX={graphNode.x ?? 0}
                      nodeY={graphNode.y ?? 0}
                      isFocused={visibility.isFocused}
                      isSelected={selectedNodeNames.has(graphNode.name)}
                      isPathNode={visibility.isPathNode}
                      graphUnselected={graphUnselected}
                      queryFiltered={visibility.queryFiltered}
                      nodeMagnification={visibility.nodeMagnification}
                      isDragEditorTarget={isDragEditorTarget}
                      filterOption={filterOption}
                      currentScale={currentScale}
                      isGraphFullScreen={isGraphFullScreen}
                      isClustered={isClustered}
                      focusedNode={focusedNode}
                      setFocusedNode={setFocusedNode}
                      onNodeContextMenu={onNodeContextMenu}
                      graphIdentifier={graphIdentifier}
                      nodeRef={nodeRef}
                      isSelectionMode={isSelectionMode}
                      onNodeSelectionToggle={onNodeSelectionToggle}
                      pairTransform={showEdgeSemanticAnimation ? getNodePairTransform(graphNode.id) : null}
                    />
                  );
                })}
              {/* 拡大されているノードを最前面に描画 */}
              {graphNodes
                .filter((graphNode) => {
                  const visibility = nodeVisibilityMap.get(graphNode.id);
                  if (!visibility) return false;
                  return (
                    ((graphNode.visible ?? false) ||
                      visibility.queryFiltered ||
                      visibility.isFocused ||
                      visibility.isPathNode) &&
                    visibility.nodeMagnification >= 2.3
                  );
                })
                .map((graphNode) => {
                  const visibility = nodeVisibilityMap.get(graphNode.id);
                  if (!visibility) return null;
                  // selectedGraphDataが存在する場合のみ、選択されていないノードを暗く表示
                  const graphUnselected = selectedGraphData
                    ? !selectedNodeNames.has(graphNode.name)
                    : false;
                  const isDragEditorTarget =
                    isEditor &&
                    dragState.isDragging &&
                    (dragState.targetNode?.id === graphNode.id ||
                      dragState.sourceNode?.id === graphNode.id);

                  return (
                    <GraphNodeCircle
                      key={graphNode.id}
                      graphNode={graphNode}
                      nodeX={graphNode.x ?? 0}
                      nodeY={graphNode.y ?? 0}
                      isFocused={visibility.isFocused}
                      isSelected={selectedNodeNames.has(graphNode.name)}
                      isPathNode={visibility.isPathNode}
                      graphUnselected={graphUnselected}
                      queryFiltered={visibility.queryFiltered}
                      nodeMagnification={visibility.nodeMagnification}
                      isDragEditorTarget={isDragEditorTarget}
                      filterOption={filterOption}
                      currentScale={currentScale}
                      isGraphFullScreen={isGraphFullScreen}
                      isClustered={isClustered}
                      focusedNode={focusedNode}
                      setFocusedNode={setFocusedNode}
                      onNodeContextMenu={onNodeContextMenu}
                      graphIdentifier={graphIdentifier}
                      nodeRef={nodeRef}
                      isSelectionMode={isSelectionMode}
                      onNodeSelectionToggle={onNodeSelectionToggle}
                      pairTransform={showEdgeSemanticAnimation ? getNodePairTransform(graphNode.id) : null}
                    />
                  );
                })}
              {isEditor && (
                <>
                  <line
                    ref={tempLineRef}
                    style={{
                      display: "none",
                      stroke: "#ef7234",
                      strokeWidth: 2,
                      strokeDasharray: "5,5",
                      pointerEvents: "none",
                      opacity: 0.5,
                    }}
                  />
                  <circle
                    ref={tempCircleRef}
                    r={5}
                    style={{
                      display: "none",
                      fill: "#ef7234",
                      opacity: 0.5,
                    }}
                  />
                </>
              )}
            </D3ZoomProvider>
            {magnifierMode > 0 && (
              <MagnifierLens
                svgRef={svgRef}
                graphNodes={graphNodes}
                graphLinks={graphLinks}
                currentScale={currentScale}
                currentTransformX={currentTransformX}
                currentTransformY={currentTransformY}
                magnifierRadius={magnifierRadius}
                onNodesInMagnifierChange={handleNodesInMagnifierChange}
                onLinksInMagnifierChange={handleLinksInMagnifierChange}
                width={width}
                height={height}
              />
            )}
          </svg>
        )}
      </div>
    </div>
  );
};
