"use client";

import { useMemo, useRef, useState, useCallback, memo } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type {
  GraphDocumentForFrontend,
  CustomNodeType,
  CustomLinkType,
  TopicGraphFilterOption,
} from "@/app/const/types";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";
import { layoutNodesOnSphere, getGreatCircleArc } from "./utils/sphere-utils";

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

// 球面上のノードコンポーネント
const SphereNode = memo(function SphereNode({
  node,
  position,
  isFocused,
  isSelected,
  isPathNode,
  graphUnselected,
  queryFiltered,
  isClustered,
  nodeColor,
  isAdditional,
  _radius,
  onClick,
  onContextMenu,
  onPointerEnter,
  onPointerLeave,
  showLabel,
}: {
  node: CustomNodeType;
  position: [number, number, number];
  isFocused: boolean;
  isSelected: boolean;
  isPathNode: boolean;
  graphUnselected: boolean;
  queryFiltered: boolean;
  isClustered: boolean;
  nodeColor?: string;
  isAdditional?: boolean;
  _radius: number;
  onClick: () => void;
  onContextMenu: (event: ThreeEvent<MouseEvent>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  showLabel: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  // ノードのサイズを計算
  const nodeSize =
    1.6 *
    ((node.neighborLinkCount ?? 0) * 0.1 + 3.6) *
    (isNodeFiltered(node, undefined) ? 1 : 0.5);

  // ノードの色を決定
  const nodeColorValue =
    isFocused || isSelected
      ? "#ef7234"
      : isPathNode
        ? "#eae80c"
        : isAdditional
          ? "#8b9dc3"
          : graphUnselected
            ? "#324557"
            : isClustered && nodeColor
              ? nodeColor
              : "whitesmoke";

  // ホバー時のアニメーション
  useFrame(() => {
    if (meshRef.current) {
      const scale = hovered || isFocused ? 1.3 : 1.0;
      meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);
    }
  });

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHovered(true);
          onPointerEnter();
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHovered(false);
          onPointerLeave();
        }}
      >
        <sphereGeometry args={[nodeSize, 16, 16]} />
        <meshStandardMaterial
          color={nodeColorValue}
          opacity={isNodeFiltered(node, undefined) ? 0.9 : 0.6}
          transparent
          emissive={isFocused ? "#ef7234" : "#000000"}
          emissiveIntensity={isFocused ? 0.5 : 0}
        />
      </mesh>
      {showLabel && (
        <Html
          position={[0, nodeSize + 2, 0]}
          center
          style={{
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <div
            style={{
              color: isFocused
                ? "whitesmoke"
                : queryFiltered
                  ? "#eab000"
                  : "dimgray",
              fontSize: "12px",
              fontWeight: isFocused ? "bold" : "normal",
              textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
              whiteSpace: "nowrap",
            }}
          >
            {node.name}
          </div>
        </Html>
      )}
    </group>
  );
});

// 球面上のエッジコンポーネント
const SphereEdge = memo(function SphereEdge({
  link: _link,
  start,
  end,
  isFocused,
  isPathLink,
  isSelectedLink,
  isAdditional,
  segments = 20,
  _radius,
  onClick,
  onContextMenu,
  onPointerEnter,
  onPointerLeave,
}: {
  link: CustomLinkType;
  start: [number, number, number];
  end: [number, number, number];
  isFocused: boolean;
  isPathLink: boolean;
  isSelectedLink: boolean;
  isAdditional: boolean;
  segments?: number;
  _radius: number;
  onClick: () => void;
  onContextMenu: (event: ThreeEvent<MouseEvent>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  const points = useMemo(() => {
    return getGreatCircleArc(start, end, _radius, segments);
  }, [start, end, _radius, segments]);

  const curve = useMemo(() => {
    const curvePoints = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    return new THREE.CatmullRomCurve3(curvePoints, false);
  }, [points]);

  const edgeColor =
    isFocused || isSelectedLink
      ? "#ef7234"
      : isPathLink
        ? "#eae80c"
        : isAdditional
          ? "#3769d4"
          : "white";

  const edgeOpacity =
    isFocused || isSelectedLink ? 1 : isPathLink ? 0.9 : hovered ? 0.7 : 0.4;

  return (
    <mesh
      ref={meshRef}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onContextMenu={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onContextMenu(e);
      }}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
        onPointerEnter();
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        setHovered(false);
        onPointerLeave();
      }}
    >
      <tubeGeometry args={[curve, segments, 0.8, 8, false]} />
      <meshStandardMaterial
        color={edgeColor}
        opacity={edgeOpacity}
        transparent
        emissive={isFocused ? "#ef7234" : "#000000"}
        emissiveIntensity={isFocused ? 0.3 : 0}
      />
    </mesh>
  );
});

// グラフシーンコンポーネント
function GraphScene({
  nodes,
  links,
  pathNodeIds,
  pathLinkIds,
  selectedNodeNames,
  selectedLinkIds,
  selectedLinkSourceTargetPairs,
  focusedNode,
  setFocusedNode,
  focusedLink,
  setFocusedLink,
  isClustered,
  filterOption: _filterOption,
  nodeSearchQuery,
  selectedGraphData,
  onNodeContextMenu,
  onLinkContextMenu,
  isSelectionMode,
  onNodeSelectionToggle,
  sphereRadius,
  showLabels,
}: {
  nodes: CustomNodeType[];
  links: CustomLinkType[];
  pathNodeIds: Set<string>;
  pathLinkIds: Set<string>;
  selectedNodeNames: Set<string>;
  selectedLinkIds: Set<string>;
  selectedLinkSourceTargetPairs: Set<string>;
  focusedNode: CustomNodeType | undefined;
  setFocusedNode: (node: CustomNodeType | undefined) => void;
  focusedLink: CustomLinkType | undefined;
  setFocusedLink: (link: CustomLinkType | undefined) => void;
  isClustered: boolean;
  filterOption?: TopicGraphFilterOption;
  nodeSearchQuery?: string;
  selectedGraphData?: GraphDocumentForFrontend;
  onNodeContextMenu?: (node: CustomNodeType) => void;
  onLinkContextMenu?: (link: CustomLinkType) => void;
  isSelectionMode?: boolean;
  onNodeSelectionToggle?: (node: CustomNodeType) => void;
  sphereRadius: number;
  showLabels: boolean;
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // ノードの位置をメモ化（ノードやリンクが変更された場合のみ再計算）
  const nodePositions = useMemo(() => {
    return layoutNodesOnSphere(nodes, links, sphereRadius, 800, 800);
  }, [nodes, links, sphereRadius]);

  // ノードの可視性情報を計算
  const nodeVisibility = useMemo(() => {
    const map = new Map<
      string,
      {
        isFocused: boolean;
        isPathNode: boolean;
        queryFiltered: boolean;
        isSelected: boolean;
        graphUnselected: boolean;
      }
    >();

    nodes.forEach((node) => {
      const isFocused = node.id === focusedNode?.id;
      const isPathNode = pathNodeIds.has(node.id);
      const queryFiltered =
        !!nodeSearchQuery &&
        nodeSearchQuery !== "" &&
        node.name.toLowerCase().includes(nodeSearchQuery.toLowerCase());
      const isSelected = selectedNodeNames.has(node.name);
      const graphUnselected = selectedGraphData
        ? !selectedNodeNames.has(node.name)
        : false;

      map.set(node.id, {
        isFocused,
        isPathNode,
        queryFiltered,
        isSelected,
        graphUnselected,
      });
    });

    return map;
  }, [
    nodes,
    focusedNode,
    pathNodeIds,
    nodeSearchQuery,
    selectedNodeNames,
    selectedGraphData,
  ]);

  const [, setHoveredLinkId] = useState<string | null>(null);

  const handleNodeClick = useCallback(
    (node: CustomNodeType) => {
      if (isSelectionMode) {
        onNodeSelectionToggle?.(node);
        return;
      }
      if (node.id === focusedNode?.id) {
        setFocusedNode(undefined);
      } else {
        setFocusedNode(node);
      }
    },
    [isSelectionMode, focusedNode, setFocusedNode, onNodeSelectionToggle],
  );

  const handleLinkClick = useCallback(
    (link: CustomLinkType) => {
      if (link.id === focusedLink?.id) {
        setFocusedLink(undefined);
      } else {
        setFocusedLink(link);
      }
    },
    [focusedLink, setFocusedLink],
  );

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <pointLight position={[-10, -10, -5]} intensity={0.5} />

      {/* エッジを描画（メモ化されたリンク配列を使用） */}
      {useMemo(
        () =>
          links.map((link) => {
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

            const sourcePos = nodePositions.get(sourceId);
            const targetPos = nodePositions.get(targetId);

            if (!sourcePos || !targetPos) return null;

            const isFocused = link.id === focusedLink?.id;
            const isPathLink = pathLinkIds.has(link.id);
            const isSelectedLink =
              selectedLinkIds.has(link.id) ||
              selectedLinkSourceTargetPairs.has(`${sourceId}-${targetId}`);

            return (
              <SphereEdge
                key={link.id}
                link={link}
                start={sourcePos}
                end={targetPos}
                isFocused={isFocused}
                isPathLink={isPathLink}
                isSelectedLink={isSelectedLink}
                isAdditional={link.isAdditional ?? false}
                _radius={sphereRadius}
                onClick={() => handleLinkClick(link)}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  onLinkContextMenu?.(link);
                }}
                onPointerEnter={() => setHoveredLinkId(link.id)}
                onPointerLeave={() => setHoveredLinkId(null)}
              />
            );
          }),
        [
          links,
          nodePositions,
          pathLinkIds,
          selectedLinkIds,
          selectedLinkSourceTargetPairs,
          focusedLink,
          sphereRadius,
          handleLinkClick,
          onLinkContextMenu,
        ],
      )}

      {/* ノードを描画（メモ化されたノード配列を使用） */}
      {useMemo(
        () =>
          nodes.map((node) => {
            const position = nodePositions.get(node.id);
            if (!position) return null;

            const visibility = nodeVisibility.get(node.id);
            if (!visibility) return null;

            return (
              <SphereNode
                key={node.id}
                node={node}
                position={position}
                isFocused={visibility.isFocused}
                isSelected={visibility.isSelected}
                isPathNode={visibility.isPathNode}
                graphUnselected={visibility.graphUnselected}
                queryFiltered={visibility.queryFiltered}
                isClustered={isClustered}
                nodeColor={node.nodeColor}
                isAdditional={node.isAdditional}
                _radius={sphereRadius}
                onClick={() => handleNodeClick(node)}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  onNodeContextMenu?.(node);
                }}
                onPointerEnter={() => setHoveredNodeId(node.id)}
                onPointerLeave={() => setHoveredNodeId(null)}
                showLabel={
                  showLabels ||
                  visibility.isFocused ||
                  hoveredNodeId === node.id
                }
              />
            );
          }),
        [
          nodes,
          nodePositions,
          nodeVisibility,
          isClustered,
          sphereRadius,
          showLabels,
          hoveredNodeId,
          handleNodeClick,
          onNodeContextMenu,
        ],
      )}
    </>
  );
}

// linkFilter関数をgraph.tsxからコピー
const linkFilter = (nodes: CustomNodeType[], links: CustomLinkType[]) => {
  const filteredNodes = nodes.filter((node) => {
    return links.find((link) => {
      return link.sourceId === node.id || link.targetId === node.id;
    });
  });
  return filteredNodes;
};

export const D3SphericalGraph = ({
  height,
  width,
  graphDocument,
  selectedGraphData,
  selectedPathData,
  tagFilterOption: filterOption,
  nodeSearchQuery,
  isLinkFiltered = false,
  isClustered = false,
  isGraphFullScreen = false,
  currentScale,
  focusedNode,
  setFocusedNode,
  focusedLink,
  setFocusedLink,
  onLinkContextMenu,
  onNodeContextMenu,
  graphIdentifier = "spherical-graph", // eslint-disable-line @typescript-eslint/no-unused-vars
  isSelectionMode,
  onNodeSelectionToggle,
}: {
  height: number;
  width: number;
  graphDocument: GraphDocumentForFrontend;
  selectedGraphData?: GraphDocumentForFrontend;
  selectedPathData?: GraphDocumentForFrontend;
  tagFilterOption?: TopicGraphFilterOption;
  nodeSearchQuery?: string;
  isLinkFiltered?: boolean;
  isClustered?: boolean;
  isGraphFullScreen?: boolean;
  currentScale: number;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  focusedNode: CustomNodeType | undefined;
  setFocusedLink: React.Dispatch<
    React.SetStateAction<CustomLinkType | undefined>
  >;
  focusedLink: CustomLinkType | undefined;
  onNodeContextMenu?: (node: CustomNodeType) => void;
  onLinkContextMenu?: (link: CustomLinkType) => void;
  graphIdentifier?: string;
  isSelectionMode?: boolean;
  onNodeSelectionToggle?: (node: CustomNodeType) => void;
}) => {
  const { nodes, relationships } = graphDocument;
  const initLinks = relationships as CustomLinkType[];
  const initNodes = isLinkFiltered ? linkFilter(nodes, initLinks) : nodes;

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

  // 球の半径を計算（画面サイズに基づいて調整）
  const sphereRadius = useMemo(() => {
    const minDimension = Math.min(width, height);
    return minDimension * 0.3;
  }, [width, height]);

  // ラベル表示の制御
  const showLabels = useMemo(() => {
    return currentScale > 0.7 || isGraphFullScreen;
  }, [currentScale, isGraphFullScreen]);

  if (nodes.length === 0 && relationships.length === 0) {
    return (
      <div className="mt-60 flex flex-col items-center">
        <div>
          <span translate="yes">グラフデータがありません</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ width, height }}>
      <Canvas
        camera={{ position: [0, 0, sphereRadius * 2.5], fov: 50 }}
        style={{ width, height }}
      >
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={sphereRadius * 1.5}
          maxDistance={sphereRadius * 5}
          autoRotate={false}
        />
        <GraphScene
          nodes={initNodes}
          links={newLinks}
          pathNodeIds={pathNodeIds}
          pathLinkIds={pathLinkIds}
          selectedNodeNames={selectedNodeNames}
          selectedLinkIds={selectedLinkIds}
          selectedLinkSourceTargetPairs={selectedLinkSourceTargetPairs}
          focusedNode={focusedNode}
          setFocusedNode={setFocusedNode}
          focusedLink={focusedLink}
          setFocusedLink={setFocusedLink}
          isClustered={isClustered}
          filterOption={filterOption}
          nodeSearchQuery={nodeSearchQuery}
          selectedGraphData={selectedGraphData}
          onNodeContextMenu={onNodeContextMenu}
          onLinkContextMenu={onLinkContextMenu}
          isSelectionMode={isSelectionMode}
          onNodeSelectionToggle={onNodeSelectionToggle}
          sphereRadius={sphereRadius}
          showLabels={showLabels}
        />
      </Canvas>
    </div>
  );
};
