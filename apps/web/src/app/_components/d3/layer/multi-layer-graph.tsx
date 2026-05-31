"use client";

import { useMemo, useRef, useState, useCallback, memo } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3";
import type {
  GraphDocumentForFrontend,
  CustomNodeType,
  CustomLinkType,
  TopicGraphFilterOption,
} from "@/app/const/types";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";

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

// 層上のノードコンポーネント
const LayerNode = memo(function LayerNode({
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

// 層上のエッジコンポーネント（水平リンク）
const LayerEdge = memo(function LayerEdge({
  link: _link,
  start,
  end,
  isFocused,
  isPathLink,
  isSelectedLink,
  isAdditional,
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
  onClick: () => void;
  onContextMenu: (event: ThreeEvent<MouseEvent>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  const curve = useMemo(() => {
    const startVec = new THREE.Vector3(start[0], start[1], start[2]);
    const endVec = new THREE.Vector3(end[0], end[1], end[2]);
    const midVec = new THREE.Vector3()
      .addVectors(startVec, endVec)
      .multiplyScalar(0.5);
    // 同じ層内なので、Y座標は同じ。曲線はX-Z平面上で描画
    const points = [startVec, midVec, endVec];
    return new THREE.CatmullRomCurve3(points, false);
  }, [start, end]);

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
      <tubeGeometry args={[curve, 20, 0.8, 8, false]} />
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

// 層間の垂直リンクコンポーネント
const VerticalEdge = memo(function VerticalEdge({
  start,
  end,
  isFocused,
  onClick,
  onPointerEnter,
  onPointerLeave,
}: {
  start: [number, number, number];
  end: [number, number, number];
  isFocused: boolean;
  onClick: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  const curve = useMemo(() => {
    const startVec = new THREE.Vector3(start[0], start[1], start[2]);
    const endVec = new THREE.Vector3(end[0], end[1], end[2]);
    // 垂直リンクは直線で描画
    const points = [startVec, endVec];
    return new THREE.CatmullRomCurve3(points, false);
  }, [start, end]);

  const edgeColor = isFocused ? "#ef7234" : "#00ff00";
  const edgeOpacity = isFocused ? 1 : hovered ? 0.8 : 0.5;

  return (
    <mesh
      ref={meshRef}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
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
      <tubeGeometry args={[curve, 20, 0.6, 8, false]} />
      <meshStandardMaterial
        color={edgeColor}
        opacity={edgeOpacity}
        transparent
        emissive={isFocused ? "#ef7234" : "#00ff00"}
        emissiveIntensity={isFocused ? 0.5 : 0.2}
      />
    </mesh>
  );
});

// 層のグリッドプレーンコンポーネント
const LayerGrid = memo(function LayerGrid({
  y,
  size,
  color,
}: {
  y: number;
  size: number;
  color: string;
}) {
  return (
    <gridHelper
      args={[size, 20, color, color]}
      position={[0, y, 0]}
      rotation={[Math.PI / 2, 0, 0]}
    />
  );
});

// ノードとリンクを層構造に変換する関数
function processLayeredGraph(
  nodes: CustomNodeType[],
  links: CustomLinkType[],
  width: number,
  height: number,
  sourceDocuments?: Array<{
    id: string;
    graph?: { dataJson: GraphDocumentForFrontend } | null;
  }>,
  layoutMode: "unified" | "layered" = "unified",
) {
  console.log("=== Multi-Layer Graph Debug Info ===");
  console.log("Total nodes:", nodes.length);
  console.log("Width:", width, "Height:", height);
  console.log("Source documents count:", sourceDocuments?.length ?? 0);

  // sourceDocumentsからdocumentGraphIdを復元するマップを作成
  // ノード名とlabelの組み合わせでマッチング
  const nodeNameToDocIdMap = new Map<string, string>();
  if (sourceDocuments) {
    sourceDocuments.forEach((doc) => {
      // 各ドキュメントのグラフIDをdocumentGraphIdとして使用
      // graphはDocumentGraphResponse型で、idプロパティを持つ
      if (doc.graph && "id" in doc.graph && doc.graph.id) {
        const docGraphId = doc.graph.id as string;
        const graphData = doc.graph.dataJson;
        if (graphData?.nodes) {
          graphData.nodes.forEach((docNode) => {
            // ノード名とlabelの組み合わせをキーとして使用
            const key = `${docNode.name}::${docNode.label}`;
            nodeNameToDocIdMap.set(key, docGraphId);
          });
        }
      }
    });
  }
  console.log("Node name to docId map size:", nodeNameToDocIdMap.size);
  console.log(
    "Sample node name to docId mappings:",
    Array.from(nodeNameToDocIdMap.entries()).slice(0, 5),
  );

  // documentGraphIdを復元（なければ元の値を使用）
  const nodesWithRestoredDocId = nodes.map((node) => {
    if (!node.documentGraphId && sourceDocuments) {
      const key = `${node.name}::${node.label}`;
      const restoredDocId = nodeNameToDocIdMap.get(key);
      if (restoredDocId) {
        return { ...node, documentGraphId: restoredDocId };
      }
    }
    return node;
  });

  // documentGraphIdでノードをグループ化
  const nodesByDocId = new Map<string, CustomNodeType[]>();
  const docIds = new Set<string>();

  nodesWithRestoredDocId.forEach((node) => {
    const docId = node.documentGraphId ?? "unknown";
    docIds.add(docId);
    if (!nodesByDocId.has(docId)) {
      nodesByDocId.set(docId, []);
    }
    nodesByDocId.get(docId)!.push(node);
  });

  console.log("Document IDs found:", Array.from(docIds));
  console.log("Number of unique document IDs:", docIds.size);
  console.log(
    "Nodes per document ID:",
    Object.fromEntries(
      Array.from(nodesByDocId.entries()).map(([id, nodes]) => [
        id,
        nodes.length,
      ]),
    ),
  );

  // 各ノードのdocumentGraphIdを確認
  const nodeDocIdSample = nodesWithRestoredDocId.slice(0, 10).map((n) => ({
    id: n.id,
    name: n.name,
    documentGraphId: n.documentGraphId,
  }));
  console.log("Sample nodes with documentGraphId (first 10):", nodeDocIdSample);

  const docIdArray = Array.from(docIds);
  // 層の間隔を大きくして、層化を明確にする
  const layerSpacing = Math.max(
    600, // 最小間隔
    (Math.max(width, height) * 0.8) / Math.max(1, docIdArray.length - 1),
  );
  const layerYPositions = new Map<string, number>();

  console.log("Layer spacing:", layerSpacing);
  console.log("Number of layers:", docIdArray.length);

  // 各層のY座標を計算（中央を0として上下に配置）
  docIdArray.forEach((docId, index) => {
    const yPos = (index - (docIdArray.length - 1) / 2) * layerSpacing;
    layerYPositions.set(docId, yPos);
    console.log(
      `Layer ${index}: docId="${docId}", Y position=${yPos}, node count=${nodesByDocId.get(docId)?.length ?? 0}`,
    );
  });

  // 層化されたノードを作成（各ノードを複製して層に配置）
  const layeredNodes: Array<
    CustomNodeType & { layerId: string; originalId: string }
  > = [];
  const nodeIdToLayeredId = new Map<string, string>(); // 元のID -> 層化されたID

  nodesWithRestoredDocId.forEach((node) => {
    const docId = node.documentGraphId ?? "unknown";
    const layeredId = `${node.id}_${docId}`;
    nodeIdToLayeredId.set(`${node.id}_${docId}`, layeredId);

    layeredNodes.push({
      ...node,
      layerId: docId,
      originalId: node.id,
      id: layeredId,
    });
  });

  // 層内リンク（同一ドキュメント内のリンク）を作成
  const intraLayerLinks: Array<CustomLinkType & { layerId: string }> = [];
  links.forEach((link) => {
    const sourceNode = nodesWithRestoredDocId.find(
      (n) => n.id === link.sourceId,
    );
    const targetNode = nodesWithRestoredDocId.find(
      (n) => n.id === link.targetId,
    );

    if (sourceNode && targetNode) {
      const sourceDocId = sourceNode.documentGraphId ?? "unknown";
      const targetDocId = targetNode.documentGraphId ?? "unknown";

      // 同じドキュメント内のリンクのみ
      if (sourceDocId === targetDocId) {
        const sourceLayeredId = `${link.sourceId}_${sourceDocId}`;
        const targetLayeredId = `${link.targetId}_${targetDocId}`;
        intraLayerLinks.push({
          ...link,
          layerId: sourceDocId,
          id: `${link.id}_${sourceDocId}`,
          sourceId: sourceLayeredId,
          targetId: targetLayeredId,
        });
      }
    }
  });

  // 層間リンク（同じ名前のノード間の垂直リンク）を作成
  const interLayerLinks: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    sourceLayerId: string;
    targetLayerId: string;
    nodeName: string;
  }> = [];

  // ノード名でグループ化
  const nodesByName = new Map<string, CustomNodeType[]>();
  nodesWithRestoredDocId.forEach((node) => {
    if (!nodesByName.has(node.name)) {
      nodesByName.set(node.name, []);
    }
    nodesByName.get(node.name)!.push(node);
  });

  // 同じ名前のノードが複数の層にある場合、層間リンクを作成
  nodesByName.forEach((nodesWithSameName, nodeName) => {
    if (nodesWithSameName.length > 1) {
      // 各層のペアに対してリンクを作成
      for (let i = 0; i < nodesWithSameName.length; i++) {
        for (let j = i + 1; j < nodesWithSameName.length; j++) {
          const node1 = nodesWithSameName[i]!;
          const node2 = nodesWithSameName[j]!;
          const docId1 = node1.documentGraphId ?? "unknown";
          const docId2 = node2.documentGraphId ?? "unknown";

          // 異なる層の場合のみリンクを作成
          if (docId1 !== docId2) {
            const layeredId1 = `${node1.id}_${docId1}`;
            const layeredId2 = `${node2.id}_${docId2}`;
            interLayerLinks.push({
              id: `inter_${node1.id}_${node2.id}`,
              sourceId: layeredId1,
              targetId: layeredId2,
              sourceLayerId: docId1,
              targetLayerId: docId2,
              nodeName: nodeName,
            });
          }
        }
      }
    }
  });

  // D3 force simulationでX-Z座標を計算
  // D3は2D（x, y）で動作するため、yをZ座標として扱う
  const centerX = width / 2;
  const centerZ = height / 2;

  const nodePositions = new Map<string, [number, number, number]>();

  if (layoutMode === "layered") {
    // 層ごとに独立したシミュレーションを実行
    docIdArray.forEach((docId) => {
      const layerNodes = layeredNodes.filter((n) => n.layerId === docId);
      const layerLinks = intraLayerLinks.filter((l) => l.layerId === docId);

      // シミュレーション用のノードコピーを作成
      const simNodes = layerNodes.map((node) => ({
        ...node,
        x: node.x ?? centerX,
        y: node.y ?? centerZ, // yをZ座標として使用
        vx: 0,
        vy: 0,
      }));

      // 層内リンクをシミュレーション用に変換
      const simLinks = layerLinks.map((link) => ({
        source: link.sourceId,
        target: link.targetId,
        id: link.id,
      }));

      // 層ごとに独立したシミュレーション
      const simulation = forceSimulation(simNodes)
        .force(
          "link",
          forceLink<
            CustomNodeType & { layerId: string; originalId: string },
            { source: string; target: string; id: string }
          >(simLinks)
            .id((d) => d.id)
            .distance(40)
            .strength(0.3),
        )
        .force("center", forceCenter(centerX, centerZ).strength(0.2))
        .force("charge", forceManyBody().strength(-60))
        .force("collision", forceCollide(3))
        .stop();

      // シミュレーションを実行
      for (let i = 0; i < 2000; ++i) {
        simulation.tick();
      }

      // ノードの位置をマップに格納
      const layerY = layerYPositions.get(docId) ?? 0;
      simNodes.forEach((node) => {
        const x = node.x ?? centerX;
        const z = node.y ?? centerZ; // D3のyをZ座標として使用
        nodePositions.set(node.id, [x, layerY, z]);
      });
    });

    // 層間リンクで繋がっているノード同士をXZ平面上で近づける調整
    // 反復的にXZ座標を平均化して、層間リンクで繋がっているノードを直下に配置
    const alignmentIterations = 100; // 調整の反復回数
    const alignmentStrength = 0.3; // 調整の強度（0-1）

    for (let iter = 0; iter < alignmentIterations; iter++) {
      interLayerLinks.forEach((link) => {
        const sourcePos = nodePositions.get(link.sourceId);
        const targetPos = nodePositions.get(link.targetId);

        if (sourcePos && targetPos) {
          // XZ座標の平均を計算
          const avgX = (sourcePos[0] + targetPos[0]) / 2;
          const avgZ = (sourcePos[2] + targetPos[2]) / 2;

          // 各ノードのXZ座標を平均に向かって移動（Y座標は保持）
          const newSourceX =
            sourcePos[0] + (avgX - sourcePos[0]) * alignmentStrength;
          const newSourceZ =
            sourcePos[2] + (avgZ - sourcePos[2]) * alignmentStrength;
          const newTargetX =
            targetPos[0] + (avgX - targetPos[0]) * alignmentStrength;
          const newTargetZ =
            targetPos[2] + (avgZ - targetPos[2]) * alignmentStrength;

          nodePositions.set(link.sourceId, [
            newSourceX,
            sourcePos[1], // Y座標は保持
            newSourceZ,
          ]);
          nodePositions.set(link.targetId, [
            newTargetX,
            targetPos[1], // Y座標は保持
            newTargetZ,
          ]);
        }
      });
    }
  } else {
    // 統一シミュレーション（現在の実装）
    // シミュレーション用のノードコピーを作成
    const simNodes = layeredNodes.map((node) => ({
      ...node,
      x: node.x ?? centerX,
      y: node.y ?? centerZ, // yをZ座標として使用
      vx: 0,
      vy: 0,
    }));

    // 層内リンクをシミュレーション用に変換
    const simLinks = intraLayerLinks.map((link) => ({
      source: link.sourceId,
      target: link.targetId,
      id: link.id,
    }));

    // 層間リンクも弱い力でシミュレーションに追加（同じノードを近くに配置）
    interLayerLinks.forEach((link) => {
      simLinks.push({
        source: link.sourceId,
        target: link.targetId,
        id: link.id,
      });
    });

    // D3 force simulation
    // ノードを集約するためにパラメータを調整
    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<
          CustomNodeType & { layerId: string; originalId: string },
          { source: string; target: string; id: string }
        >(simLinks)
          .id((d) => d.id)
          .distance((d) => {
            // 層間リンクは弱い力で接続、層内リンクは距離を短くして集約
            const link = simLinks.find((l) => l.id === d.id);
            const isInterLayer = interLayerLinks.some(
              (il) => il.id === link?.id,
            );
            return isInterLayer ? 150 : 40; // 層内リンクの距離を60→40に短縮
          })
          .strength((d) => {
            const link = simLinks.find((l) => l.id === d.id);
            const isInterLayer = interLayerLinks.some(
              (il) => il.id === link?.id,
            );
            return isInterLayer ? 0.1 : 0.3; // 層内リンクの強度を0.2→0.3に増加
          }),
      )
      .force("center", forceCenter(centerX, centerZ).strength(0.2)) // 中心への引力を0.05→0.15に増加
      .force("charge", forceManyBody().strength(-60)) // 斥力を-120→-60に弱化（より集約）
      .force("collision", forceCollide(3)) // 衝突半径を5→3に縮小
      .stop();

    // シミュレーションを実行（イテレーション数を増やしてより収束させる）
    for (let i = 0; i < 2000; ++i) {
      simulation.tick();
    }

    // ノードの位置をマップに格納
    simNodes.forEach((node) => {
      const docId = node.layerId;
      const layerY = layerYPositions.get(docId) ?? 0; // 層のY座標（高さ）
      const x = node.x ?? centerX;
      const z = node.y ?? centerZ; // D3のyをZ座標として使用
      nodePositions.set(node.id, [x, layerY, z]);
    });
  }

  // ノード位置のサンプルを出力
  const positionSample = Array.from(nodePositions.entries())
    .slice(0, 10)
    .map(([id, pos]) => {
      const node = layeredNodes.find((n) => n.id === id);
      return {
        id,
        name: node?.name,
        layerId: node?.layerId,
        position: pos,
      };
    });
  console.log("Sample node positions (first 10):", positionSample);

  // Y座標の統計情報
  const yPositions = Array.from(nodePositions.values()).map((pos) => pos[1]);
  const uniqueYPositions = Array.from(new Set(yPositions)).sort(
    (a, b) => a - b,
  );
  console.log("Unique Y positions:", uniqueYPositions);
  console.log("Y position range:", {
    min: Math.min(...yPositions),
    max: Math.max(...yPositions),
    uniqueCount: uniqueYPositions.length,
  });

  console.log("=== End Debug Info ===");

  return {
    layeredNodes,
    intraLayerLinks,
    interLayerLinks,
    nodePositions,
    layerYPositions,
    docIdArray,
  };
}

// グラフシーンコンポーネント
function MultiLayerGraphScene({
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
  width,
  height,
  showLabels,
  isSelectionMode: _isSelectionMode,
  onNodeSelectionToggle: _onNodeSelectionToggle,
  sourceDocuments,
  layoutMode,
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
  width: number;
  height: number;
  showLabels: boolean;
  isSelectionMode?: boolean;
  onNodeSelectionToggle?: (node: CustomNodeType) => void;
  sourceDocuments?: Array<{
    id: string;
    graph?: { id: string; dataJson: GraphDocumentForFrontend } | null;
  }>;
  layoutMode?: "unified" | "layered";
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // 層化されたグラフデータを計算
  const layeredData = useMemo(() => {
    return processLayeredGraph(
      nodes,
      links,
      width,
      height,
      sourceDocuments,
      layoutMode ?? "unified",
    );
  }, [nodes, links, width, height, sourceDocuments, layoutMode]);

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

    layeredData.layeredNodes.forEach((node) => {
      const isFocused = node.originalId === focusedNode?.id;
      const isPathNode = pathNodeIds.has(node.originalId);
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
    layeredData.layeredNodes,
    focusedNode,
    pathNodeIds,
    nodeSearchQuery,
    selectedNodeNames,
    selectedGraphData,
  ]);

  const handleNodeClick = useCallback(
    (node: CustomNodeType & { originalId: string }) => {
      // 元のノードを取得
      const originalNode = nodes.find((n) => n.id === node.originalId);
      if (originalNode) {
        if (originalNode.id === focusedNode?.id) {
          setFocusedNode(undefined);
        } else {
          setFocusedNode(originalNode);
        }
      }
    },
    [focusedNode, setFocusedNode, nodes],
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

  const maxLayerSize = Math.max(width, height) * 0.8;

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <pointLight position={[-10, -10, -5]} intensity={0.5} />

      {/* XYZ軸を表示 */}
      <axesHelper args={[Math.max(width, height) * 0.3]} />

      {/* 層のグリッドを描画 */}
      {layeredData.docIdArray.map((docId) => {
        const y = layeredData.layerYPositions.get(docId) ?? 0;
        return (
          <LayerGrid key={docId} y={y} size={maxLayerSize} color="#444444" />
        );
      })}

      {/* 層間リンク（垂直リンク）を描画 */}
      {layeredData.interLayerLinks.map((link) => {
        const sourcePos = layeredData.nodePositions.get(link.sourceId);
        const targetPos = layeredData.nodePositions.get(link.targetId);

        if (!sourcePos || !targetPos) return null;

        const isFocused =
          focusedNode &&
          (layeredData.layeredNodes.find((n) => n.id === link.sourceId)
            ?.originalId === focusedNode.id ||
            layeredData.layeredNodes.find((n) => n.id === link.targetId)
              ?.originalId === focusedNode.id);

        return (
          <VerticalEdge
            key={link.id}
            start={sourcePos}
            end={targetPos}
            isFocused={!!isFocused}
            onClick={() => {
              // 層間リンクのクリック処理
            }}
            onPointerEnter={() => {
              // TODO: Implement link hover effect
            }}
            onPointerLeave={() => {
              // TODO: Implement link hover effect
            }}
          />
        );
      })}

      {/* 層内リンク（水平リンク）を描画 */}
      {layeredData.intraLayerLinks.map((link) => {
        const sourcePos = layeredData.nodePositions.get(link.sourceId);
        const targetPos = layeredData.nodePositions.get(link.targetId);

        if (!sourcePos || !targetPos) return null;

        const isFocused = link.id === focusedLink?.id;
        const isPathLink = pathLinkIds.has(link.id.split("_")[0]!);
        const sourceId = link.sourceId.split("_")[0]!;
        const targetId = link.targetId.split("_")[0]!;
        const isSelectedLink =
          selectedLinkIds.has(link.id.split("_")[0]!) ||
          selectedLinkSourceTargetPairs.has(`${sourceId}-${targetId}`);

        return (
          <LayerEdge
            key={link.id}
            link={link}
            start={sourcePos}
            end={targetPos}
            isFocused={isFocused}
            isPathLink={isPathLink}
            isSelectedLink={isSelectedLink}
            isAdditional={link.isAdditional ?? false}
            onClick={() => {
              // 元のリンクを取得
              const originalLink = links.find(
                (l) => l.id === link.id.split("_")[0],
              );
              if (originalLink) {
                handleLinkClick(originalLink);
              }
            }}
            onContextMenu={(e) => {
              e.stopPropagation();
              const originalLink = links.find(
                (l) => l.id === link.id.split("_")[0],
              );
              if (originalLink) {
                onLinkContextMenu?.(originalLink);
              }
            }}
            onPointerEnter={() => {
              // TODO: Implement link hover effect
            }}
            onPointerLeave={() => {
              // TODO: Implement link hover effect
            }}
          />
        );
      })}

      {/* ノードを描画 */}
      {layeredData.layeredNodes.map((node) => {
        const position = layeredData.nodePositions.get(node.id);
        if (!position) return null;

        const visibility = nodeVisibility.get(node.id);
        if (!visibility) return null;

        return (
          <LayerNode
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
            onClick={() => handleNodeClick(node)}
            onContextMenu={(e) => {
              e.stopPropagation();
              const originalNode = nodes.find((n) => n.id === node.originalId);
              if (originalNode) {
                onNodeContextMenu?.(originalNode);
              }
            }}
            onPointerEnter={() => setHoveredNodeId(node.id)}
            onPointerLeave={() => setHoveredNodeId(null)}
            showLabel={
              showLabels || visibility.isFocused || hoveredNodeId === node.id
            }
          />
        );
      })}
    </>
  );
}

const linkFilter = (nodes: CustomNodeType[], links: CustomLinkType[]) => {
  const filteredNodes = nodes.filter((node) => {
    return links.find((link) => {
      return link.sourceId === node.id || link.targetId === node.id;
    });
  });
  return filteredNodes;
};

export const D3MultiLayerGraph = ({
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
  graphIdentifier = "multi-layer-graph", // eslint-disable-line @typescript-eslint/no-unused-vars
  isSelectionMode,
  onNodeSelectionToggle,
  showLabels: showLabelsProp,
  setShowLabels: _setShowLabels,
  sourceDocuments,
  layoutMode: layoutModeProp = "unified",
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
  showLabels?: boolean;
  setShowLabels?: React.Dispatch<React.SetStateAction<boolean>>;
  sourceDocuments?: Array<{
    id: string;
    graph?: { id: string; dataJson: GraphDocumentForFrontend } | null;
  }>;
  layoutMode?: "unified" | "layered";
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

  // ラベル表示の制御（propsで渡された値を使用、なければ自動計算）
  const showLabels = useMemo(() => {
    if (showLabelsProp !== undefined) {
      return showLabelsProp;
    }
    return currentScale > 0.7 || isGraphFullScreen;
  }, [showLabelsProp, currentScale, isGraphFullScreen]);

  // カメラの距離を計算
  const cameraDistance = useMemo(() => {
    const maxDimension = Math.max(width, height);
    return maxDimension * 1.5;
  }, [width, height]);

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
        camera={{
          position: [0, cameraDistance * 0.3, cameraDistance * 0.8],
          fov: 75,
          near: 0.1,
          far: cameraDistance * 10,
        }}
        style={{ width, height }}
      >
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={cameraDistance * 0.5}
          maxDistance={cameraDistance * 3}
          autoRotate={false}
        />
        <MultiLayerGraphScene
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
          width={width}
          height={height}
          showLabels={showLabels}
          isSelectionMode={isSelectionMode}
          onNodeSelectionToggle={onNodeSelectionToggle}
          sourceDocuments={sourceDocuments}
          layoutMode={layoutModeProp ?? "unified"}
        />
      </Canvas>
    </div>
  );
};
