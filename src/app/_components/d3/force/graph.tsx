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
} from "d3";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { D3ZoomProvider } from "../zoom";
import type { TopicGraphFilterOption } from "@/app/const/types";
import {
  dragEditorExtension,
  type DragState,
} from "../extension/drag-editor-extension";

import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";
import { MagnifierLens } from "../magnifier/magnifier-lens";

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

// ノード描画用のコンポーネント（メモ化）
const GraphNodeCircle = memo(function GraphNodeCircle({
  graphNode,
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
}: {
  graphNode: CustomNodeType;
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
}) {
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

  return (
    <g
      key={graphNode.id}
      ref={nodeRef}
      className={`${graphIdentifier}-node cursor-pointer`}
      transform={`translate(${graphNode.x}, ${graphNode.y})`}
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
  );
});

const linkFilter = (nodes: CustomNodeType[], links: CustomLinkType[]) => {
  const filteredNodes = nodes.filter((node) => {
    return links.find((link) => {
      return link.sourceId === node.id || link.targetId === node.id;
    });
  });
  return filteredNodes;
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
}) => {
  const { nodes, relationships } = graphDocument;
  const initLinks = relationships as CustomLinkType[];
  const initNodes = isLinkFiltered ? linkFilter(nodes, initLinks) : nodes;

  // ハイライト情報は後で適用するため、initNodesとnewLinksはhighlightDataに依存しない
  const newLinks = useMemo(() => {
    return initLinks.map((d) => {
      const source = getNodeByIdForFrontend(
        d.sourceId,
        initNodes,
      ) as CustomNodeType;
      const target = getNodeByIdForFrontend(
        d.targetId,
        initNodes,
      ) as CustomNodeType;
      return {
        ...d,
        source: source,
        target: target,
      };
    });
  }, [initLinks, initNodes]);

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
      setGraphNodes((prevNodes) =>
        prevNodes.map((node) => ({
          ...node,
          isAddedInHistory: false,
          isRemovedInHistory: false,
        })),
      );
      setGraphLinks((prevLinks) =>
        prevLinks.map((link) => ({
          ...link,
          isAddedInHistory: false,
          isRemovedInHistory: false,
        })),
      );
      return;
    }

    // 既存のノードとリンクのプロパティのみを更新
    setGraphNodes((prevNodes) =>
      prevNodes.map((node) => ({
        ...node,
        isAddedInHistory: highlightData.addedNodeIds.has(node.id),
        isRemovedInHistory: highlightData.removedNodeIds.has(node.id),
      })),
    );

    setGraphLinks((prevLinks) =>
      prevLinks.map((link) => ({
        ...link,
        isAddedInHistory: highlightData.addedLinkIds.has(link.id),
        isRemovedInHistory: highlightData.removedLinkIds.has(link.id),
      })),
    );
  }, [highlightData]);

  const [nodesInMagnifier, setNodesInMagnifier] = useState<string[]>([]);
  const [linksInMagnifier, setLinksInMagnifier] = useState<string[]>([]);
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
      const isInMagnifier = nodesInMagnifier.includes(graphNode.id);
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
    nodesInMagnifier,
    nodeMagnifications,
  ]);

  // リンクの拡大率情報をメモ化
  const linkMagnificationMap = useMemo(() => {
    const map = new Map<string, number>();
    graphLinks.forEach((link) => {
      const isInMagnifier = linksInMagnifier.includes(link.id);
      map.set(
        link.id,
        isInMagnifier ? (linkMagnifications.get(link.id) ?? 1) : 1,
      );
    });
    return map;
  }, [graphLinks, linksInMagnifier, linkMagnifications]);

  // アニメーションフレームのスロットリング用
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const THROTTLE_MS = 16; // 約60fps

  // graphNodesとgraphLinksの最新の状態をrefで保持して、updateGraph内で参照できるようにする
  const graphNodesRef = useRef<CustomNodeType[]>(graphNodes);
  const graphLinksRef = useRef<CustomLinkType[]>(graphLinks);

  // graphNodesとgraphLinksが変更されたらrefを更新
  useEffect(() => {
    graphNodesRef.current = graphNodes;
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

  useEffect(() => {
    // width/heightが無効な値の場合はシミュレーションを初期化しない
    if (width <= 0 || height <= 0 || !initNodes.length || !newLinks.length) {
      return;
    }

    // リセット
    lastUpdateTimeRef.current = 0;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const centerX = width / 2;
    const centerY = height / 2;
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
      .force("center", forceCenter(centerX, centerY))
      .force("charge", forceManyBody().strength(-40))
      .force(
        "x",
        forceX().x(function (d) {
          const nodeData = d as CustomNodeType;
          const node = nodeMap.get(nodeData.id);
          return (
            centerX + (isClustered && node?.clustered?.x ? node.clustered.x : 0)
          );
        }),
      )
      .force(
        "y",
        forceY().y(function (d) {
          const nodeData = d as CustomNodeType;
          const node = nodeMap.get(nodeData.id);
          return (
            centerY + (isClustered && node?.clustered?.y ? node.clustered.y : 0)
          );
        }),
      )
      .force("collision", forceCollide(1));

    simulation.alpha(0.5);
    simulation.alphaDecay(0.0228); // より遅い減衰で、シミュレーションを継続させる
    simulation.alphaMin(0.001); // 最小alpha値を設定して、シミュレーションが終了しないようにする
    simulation.alphaTarget(0); // 目標alpha値は0（通常通り）

    // requestAnimationFrameでスロットリングしてsetStateを最適化
    // graphNodesRefとgraphLinksRefは既にトップレベルで定義されているので、ここでは使用するだけ

    const updateGraph = () => {
      // シミュレーションの最新のノードデータを取得
      const currentNodes = simulation.nodes();
      const updateTime = performance.now();

      const visibleByScaling =
        currentScale > 4
          ? 0
          : currentScale > 3
            ? 0
            : currentScale > 2
              ? 4
              : currentScale > 1
                ? 6
                : currentScale > 0.9
                  ? 8
                  : 10;

      // graphNodesの最新の状態からプロパティを取得するためのMapを作成
      const currentGraphNodesMap = new Map<string, CustomNodeType>();
      graphNodesRef.current.forEach((node) =>
        currentGraphNodesMap.set(node.id, node),
      );

      // シミュレーションで更新された位置情報（x, y, vx, vy, fx, fy）と
      // 最新のノードのプロパティ（nodeColor, isAdditional, isAddedInHistoryなど）をマージ
      const updatedNodes = currentNodes.map((node) => {
        const currentGraphNode = currentGraphNodesMap.get(node.id);
        const nodeVisible =
          isGraphFullScreen ||
          !(isLargeGraph && (node.neighborLinkCount ?? 0) <= visibleByScaling);

        // currentGraphNodeが存在する場合は最新のプロパティを保持し、存在しない場合はnodeをそのまま使用
        return {
          ...(currentGraphNode ?? node), // 最新のノードのプロパティ（nodeColor, isAdditional, isAddedInHistoryなど）を保持
          ...node, // シミュレーションで更新された位置情報（x, y, vx, vy, fx, fy）を上書き
          visible: nodeVisible,
        };
      });

      setGraphNodes(updatedNodes);
      // リンクはソースとターゲットへの参照なので、ノードが更新されれば自動的に更新される
      // シミュレーションの最新のリンクを取得（sourceとtargetが最新のノード位置を参照）
      // currentNodesからノードのMapを作成して、リンクのsourceとtargetを更新
      const nodeMapForLinks = new Map<string, CustomNodeType>();
      updatedNodes.forEach((node) => nodeMapForLinks.set(node.id, node));

      // graphLinksの最新の状態からプロパティを取得するためのMapを作成
      const currentGraphLinksMap = new Map<string, CustomLinkType>();
      graphLinksRef.current.forEach((link) =>
        currentGraphLinksMap.set(link.id, link),
      );

      // newLinksのsourceとtargetを最新のノードに更新し、最新のプロパティを保持
      const updatedLinks = newLinks.map((link) => {
        // link.sourceとlink.targetはCustomNodeType型なので、直接idにアクセス可能
        const sourceId =
          typeof link.source === "object" &&
            link.source !== null &&
            "id" in link.source
            ? link.source.id
            : link.sourceId;
        const targetId =
          typeof link.target === "object" &&
            link.target !== null &&
            "id" in link.target
            ? link.target.id
            : link.targetId;
        const sourceNode = nodeMapForLinks.get(sourceId);
        const targetNode = nodeMapForLinks.get(targetId);

        if (sourceNode && targetNode) {
          const currentGraphLink = currentGraphLinksMap.get(link.id);
          return {
            ...(currentGraphLink ?? link), // 最新のリンクのプロパティ（isAddedInHistoryなど）を保持
            ...link, // 元のリンクのプロパティ
            source: sourceNode,
            target: targetNode,
          };
        }
        return link;
      });

      // Reactの再レンダリングのために新しい配列を作成
      setGraphLinks(updatedLinks);
      lastUpdateTimeRef.current = updateTime;
    };

    simulation.on("tick", () => {
      const now = performance.now();
      const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

      // 最後の更新から一定時間経過している場合、またはまだ更新されていない場合
      if (
        timeSinceLastUpdate >= THROTTLE_MS ||
        lastUpdateTimeRef.current === 0
      ) {
        // 既存のアニメーションフレームをキャンセル（最新の状態を反映するため）
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        // 新しいアニメーションフレームをスケジュール
        animationFrameRef.current = requestAnimationFrame(() => {
          animationFrameRef.current = null;
          updateGraph();
        });
      } else if (animationFrameRef.current === null) {
        // まだアニメーションフレームがスケジュールされていない場合
        animationFrameRef.current = requestAnimationFrame(() => {
          animationFrameRef.current = null;
          updateGraph();
        });
      }
    });

    simulation.on("end", () => {
      // シミュレーションが終了した場合、再度開始する（alpha値をリセット）
      // ただし、alphaが非常に小さい場合のみ（通常の終了）
      if (simulation.alpha() < simulation.alphaMin()) {
        simulation.alpha(0.3); // 小さなalpha値で再開
        simulation.restart(); // シミュレーションを再開
      }
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
      });
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      simulation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    newLinks,
    initNodes,
    width,
    height,
    initLinks,
    currentScale,
    nodes.length,
    isClustered,
    isGraphFullScreen,
    isLargeGraph,
    nodeMap,
  ]);

  return (
    <div className="flex flex-col">
      <div className={`h-[${String(height)}px] w-[${String(width)}px]`}>
        {toolComponent}
        {nodes.length === 0 && relationships.length === 0 ? (
          <div className="mt-60 flex flex-col items-center">
            <div>
              <span translate="yes">グラフデータがありません</span>
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
              {graphLinks.map((graphLink) => {
                const { source, target, type } = graphLink;
                const modSource = source as CustomNodeType;
                const modTarget = target as CustomNodeType;
                const isFocused = graphLink.id === focusedLink?.id;
                const isPathLink = pathLinkIds.has(graphLink.id);
                const isSelectedLink =
                  selectedLinkIds.has(graphLink.id) ||
                  selectedLinkSourceTargetPairs.has(
                    `${modSource.id}-${modTarget.id}`,
                  );
                const linkMagnification =
                  linkMagnificationMap.get(graphLink.id) ?? 1;

                const sourceNode = nodeMap.get(modSource.id);
                const targetNode = nodeMap.get(modTarget.id);
                const sourceNodeVisible = sourceNode?.visible ?? false;
                const targetNodeVisible = targetNode?.visible ?? false;

                // 既存コンテキストエッジかどうかを判定
                const isExistingContextLink =
                  graphLink.isExistingContext ??
                  sourceNode?.isExistingContext ??
                  targetNode?.isExistingContext;

                if (
                  (sourceNodeVisible || targetNodeVisible) &&
                  modSource.x !== undefined &&
                  modTarget.x !== undefined &&
                  modSource.y !== undefined &&
                  modTarget.y !== undefined
                ) {
                  const isGradient = sourceNodeVisible !== targetNodeVisible;
                  // const gradientTo: number | undefined =
                  //   isGradient && targetNodeVisible
                  //     ? sourceNode?.id
                  //     : targetNode?.id;

                  // const gradientFrom: number | undefined =
                  //   gradientTo === sourceNode?.id
                  //     ? targetNode?.id
                  //     : sourceNode?.id;

                  // console.log("-----");
                  // console.log(
                  //   "sourceNode: ",
                  //   sourceNode?.id,
                  //   sourceNode?.visible,
                  // );
                  // console.log(
                  //   "targetNode: ",
                  //   targetNode?.id,
                  //   targetNode?.visible,
                  // );
                  // console.log(gradientFrom, " -> ", gradientTo);

                  return (
                    <g
                      className="link cursor-pointer"
                      key={`${modSource.id}-${type}-${modTarget.id}`}
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
                        // strokeOpacity={isFocused ? 1 : isGradient ? 0.3 : 0.4}
                        x1={modSource.x}
                        y1={modSource.y}
                        x2={modTarget.x}
                        y2={modTarget.y}
                      ></line>
                      {isDirectedLinks && (
                        <g>
                          <line
                            stroke={"orange"}
                            strokeWidth={(isFocused ? 2 : 1.2) * 1.5}
                            strokeOpacity={0.1}
                            x1={modSource.x}
                            y1={modSource.y}
                            x2={modTarget.x}
                            y2={modTarget.y}
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

                      {/* <defs>
                      <linearGradient
                        id={`gradient-${graphLink.id}`}
                        x1={gradientTo === modSource.id ? "0%" : "100%"}
                        y1={gradientTo === modSource.id ? "0%" : "100%"}
                        x2={gradientTo === modTarget.id ? "0%" : "100%"}
                        y2={gradientTo === modTarget.id ? "0%" : "100%"}
                      >
                        <stop offset="0%" stopColor="white" stopOpacity={0} />
                        <stop
                          offset="100%"
                          stopColor="white"
                          stopOpacity={0.3}
                        />
                      </linearGradient>
                    </defs> */}
                      {currentScale > 3.5 && (
                        <text
                          x={(modSource.x + modTarget.x) / 2}
                          y={(modSource.y + modTarget.y) / 2}
                          textAnchor="middle"
                          fill={"darkgray"}
                          fontSize={2.5}
                        >
                          {graphLink.type}
                        </text>
                      )}
                    </g>
                  );
                }
              })}
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
