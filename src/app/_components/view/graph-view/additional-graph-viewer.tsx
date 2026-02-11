import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { api } from "@/trpc/react";
import { useRef, useState, useMemo } from "react";
import { NodeLinkEditModal } from "../../modal/node-link-edit-modal";
import {
  LinkPropertyEditModal,
  NodePropertyEditModal,
} from "../../modal/node-link-property-edit-modal";
import { D3ForceGraph } from "../../d3/force/graph";
import { Button } from "../../button/button";
import { Loading } from "../../loading/loading";
import { CrossLargeIcon } from "../../icons";
import { ContainerSizeProvider } from "@/providers/container-size";
import { createId } from "@/app/_utils/cuid/cuid";

const AdditionalGraphViewer = ({
  topicSpaceId,
  refetch,
  newGraphDocument,
  setGraphDocument,
  onConfirm,
  hideConfirmButton = false,
  /** 親で一覧パネルを表示する場合は渡す（onConfirm 利用時）。渡すとグラフ更新時にモーダルを開かず親の state を更新する */
  additionalGraph: controlledAdditionalGraph,
  setAdditionalGraph: controlledSetAdditionalGraph,
}: {
  topicSpaceId: string;
  refetch: () => void;
  newGraphDocument: GraphDocumentForFrontend | null;
  setGraphDocument: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | null>
  >;
  /** 渡されたときは「統合」の代わりに「グラフに反映」を表示し、クリックで onConfirm(マージ済みグラフ) を呼ぶ */
  onConfirm?: (graph: GraphDocumentForFrontend) => void;
  /** onConfirm 利用時に true にすると「グラフに反映」ボタンを描画しない（親のフッターなどに配置する場合） */
  hideConfirmButton?: boolean;
  additionalGraph?: GraphDocumentForFrontend | undefined;
  setAdditionalGraph?: React.Dispatch<
    React.SetStateAction<GraphDocumentForFrontend | undefined>
  >;
}) => {
  const integrateGraph = api.kg.integrateGraph.useMutation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(400);
  const [isIntegrating, setIsIntegrating] = useState<boolean>(false);

  // 既存のトピックスペースのグラフデータを取得
  const { data: topicSpaceData } = api.topicSpaces.getByIdPublic.useQuery(
    { id: topicSpaceId },
    { enabled: !!topicSpaceId },
  );

  // グラフデータに統合予定フラグを付与
  const annotatedGraphDocument = useMemo(() => {
    if (!newGraphDocument || !topicSpaceData?.graphData) {
      return newGraphDocument;
    }

    const existingNodes = topicSpaceData.graphData.nodes ?? [];
    const existingRelationships = topicSpaceData.graphData.relationships ?? [];

    // 既存ノードを名前+ラベルでマッピング（IDも保持）
    const existingNodeMap = new Map<
      string,
      { id: string; node: (typeof existingNodes)[0] }
    >();
    existingNodes.forEach((node) => {
      const key = `${node.name}:${node.label}`;
      existingNodeMap.set(key, { id: node.id, node });
    });

    // 統合予定ノードのIDセットを作成（追加グラフ内のノードID）
    const mergeTargetNodeIds = new Set<string>();
    const mergeTargetNodeKeys = new Set<string>();
    newGraphDocument.nodes.forEach((node) => {
      const key = `${node.name}:${node.label}`;
      if (existingNodeMap.has(key)) {
        mergeTargetNodeIds.add(node.id);
        mergeTargetNodeKeys.add(key);
      }
    });

    // 既存グラフから、統合予定ノードに関連するノードとエッジを取得
    const existingContextNodeIds = new Set<string>();
    const existingContextNodeKeys = new Set<string>();
    const existingContextRelationships: typeof existingRelationships = [];

    existingRelationships.forEach((rel) => {
      // topicSpaceData.graphData は既に sourceId/targetId 形式に変換されている
      const sourceNode = existingNodes.find((n) => n.id === rel.sourceId);
      const targetNode = existingNodes.find((n) => n.id === rel.targetId);

      if (sourceNode && targetNode) {
        const sourceKey = `${sourceNode.name}:${sourceNode.label}`;
        const targetKey = `${targetNode.name}:${targetNode.label}`;

        const sourceIsMergeTarget = mergeTargetNodeKeys.has(sourceKey);
        const targetIsMergeTarget = mergeTargetNodeKeys.has(targetKey);

        // 統合予定ノードに接続されている既存ノードとエッジを特定
        if (sourceIsMergeTarget && !targetIsMergeTarget) {
          existingContextNodeIds.add(rel.targetId);
          existingContextNodeKeys.add(targetKey);
          existingContextRelationships.push(rel);
        }
        if (targetIsMergeTarget && !sourceIsMergeTarget) {
          existingContextNodeIds.add(rel.sourceId);
          existingContextNodeKeys.add(sourceKey);
          existingContextRelationships.push(rel);
        }
      }
    });

    // 既存コンテキストノードを追加グラフに含める
    const contextNodes = existingNodes
      .filter((node) => {
        const key = `${node.name}:${node.label}`;
        return existingContextNodeKeys.has(key);
      })
      .map((node) => ({
        ...node,
        id: `context-${node.id}`, // 追加グラフ内で一意のIDを生成
        isMergeTarget: false,
        isExistingContext: true,
        visible: true, // 表示されるようにする
      }));

    // 既存コンテキストエッジを追加グラフに含める
    const contextRelationships = existingContextRelationships.map((rel) => {
      const sourceNode = existingNodes.find((n) => n.id === rel.sourceId);
      const targetNode = existingNodes.find((n) => n.id === rel.targetId);
      const sourceKey = sourceNode
        ? `${sourceNode.name}:${sourceNode.label}`
        : "";
      const targetKey = targetNode
        ? `${targetNode.name}:${targetNode.label}`
        : "";

      // 統合予定ノードのIDを追加グラフ内のIDにマッピング
      let sourceId = rel.sourceId;
      let targetId = rel.targetId;

      if (mergeTargetNodeKeys.has(sourceKey)) {
        // 追加グラフ内の統合予定ノードのIDを探す
        const mergeTargetNode = newGraphDocument.nodes.find(
          (n) => `${n.name}:${n.label}` === sourceKey,
        );
        if (mergeTargetNode) {
          sourceId = mergeTargetNode.id;
        }
      } else if (existingContextNodeKeys.has(sourceKey) && sourceNode) {
        // 既存コンテキストノードのIDは context- プレフィックス付き
        sourceId = `context-${sourceNode.id}`;
      }

      if (mergeTargetNodeKeys.has(targetKey)) {
        const mergeTargetNode = newGraphDocument.nodes.find(
          (n) => `${n.name}:${n.label}` === targetKey,
        );
        if (mergeTargetNode) {
          targetId = mergeTargetNode.id;
        }
      } else if (existingContextNodeKeys.has(targetKey) && targetNode) {
        // 既存コンテキストノードのIDは context- プレフィックス付き
        targetId = `context-${targetNode.id}`;
      }

      return {
        ...rel,
        id: `context-${rel.id}`,
        sourceId,
        targetId,
        isExistingContext: true,
      };
    });

    // 追加グラフのノードにフラグを付与
    const annotatedNodes = newGraphDocument.nodes.map((node) => ({
      ...node,
      isMergeTarget: mergeTargetNodeIds.has(node.id),
      isExistingContext: false, // 新しく追加される予定のノードは通常表示
    }));

    // 既存コンテキストノードとエッジを追加
    const allNodes = [...annotatedNodes, ...contextNodes];
    const allRelationships = [
      ...newGraphDocument.relationships,
      ...contextRelationships,
    ];

    console.log("統合予定ノード数:", mergeTargetNodeIds.size);
    console.log("既存コンテキストノード数:", contextNodes.length);
    console.log("既存コンテキストエッジ数:", contextRelationships.length);
    console.log("追加グラフの全ノード数:", allNodes.length);
    console.log("追加グラフの全エッジ数:", allRelationships.length);

    return {
      ...newGraphDocument,
      nodes: allNodes,
      relationships: allRelationships,
    };
  }, [newGraphDocument, topicSpaceData]);
  const submitGraph = () => {
    setIsIntegrating(true);
    if (
      !topicSpaceId ||
      !annotatedGraphDocument ||
      !topicSpaceData?.graphData
    ) {
      setIsIntegrating(false);
      return;
    }

    const existingNodes = topicSpaceData.graphData.nodes ?? [];
    const existingRelationships = topicSpaceData.graphData.relationships ?? [];

    console.log("=== 統合処理開始 ===");
    console.log("既存ノード数:", existingNodes.length);
    console.log("既存エッジ数:", existingRelationships.length);
    console.log(
      "annotatedGraphDocumentノード数:",
      annotatedGraphDocument.nodes.length,
    );
    console.log(
      "annotatedGraphDocumentエッジ数:",
      annotatedGraphDocument.relationships.length,
    );

    // 統合時に送信するグラフデータから、既存コンテキストノードを除外
    // （既に存在するため、統合処理で重複を避ける）
    const nodesToIntegrate = annotatedGraphDocument.nodes.filter(
      (node) => !node.id.startsWith("context-"),
    );

    console.log("統合対象ノード数（context-除外後）:", nodesToIntegrate.length);
    console.log(
      "統合対象ノードID一覧:",
      nodesToIntegrate.map((n) => n.id),
    );

    // エッジの処理：
    // 1. 新規エッジ（context- プレフィックスなし）はそのまま含める
    // 2. 既存コンテキストエッジ（context- プレフィックス付き）は、統合予定ノードと既存コンテキストノード間のエッジのみ含める
    //    この場合、context- プレフィックスを除去して既存ノードIDにマッピングし、新しいIDを生成
    const relationshipsBeforeFilter = annotatedGraphDocument.relationships.map(
      (rel) => {
        // context- プレフィックス付きのIDを既存ノードIDにマッピング
        let sourceId = rel.sourceId;
        let targetId = rel.targetId;
        let sourceIdChanged = false;
        let targetIdChanged = false;

        if (rel.sourceId.startsWith("context-")) {
          const originalId = rel.sourceId.replace("context-", "");
          const existingNode = existingNodes.find((n) => n.id === originalId);
          if (existingNode) {
            sourceId = existingNode.id;
            sourceIdChanged = true;
          }
        }

        if (rel.targetId.startsWith("context-")) {
          const originalId = rel.targetId.replace("context-", "");
          const existingNode = existingNodes.find((n) => n.id === originalId);
          if (existingNode) {
            targetId = existingNode.id;
            targetIdChanged = true;
          }
        }

        return {
          ...rel,
          id: rel.id.startsWith("context-") ? createId() : rel.id, // 既存コンテキストエッジは新しいIDを生成
          sourceId,
          targetId,
          _originalSourceId: rel.sourceId,
          _originalTargetId: rel.targetId,
          _sourceIdChanged: sourceIdChanged,
          _targetIdChanged: targetIdChanged,
        };
      },
    );

    console.log(
      "エッジ変換後（フィルタ前）:",
      relationshipsBeforeFilter.length,
    );
    relationshipsBeforeFilter.forEach((rel, idx) => {
      console.log(`  エッジ[${idx}]:`, {
        id: rel.id,
        type: rel.type,
        originalSourceId: rel._originalSourceId,
        originalTargetId: rel._originalTargetId,
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        sourceIdChanged: rel._sourceIdChanged,
        targetIdChanged: rel._targetIdChanged,
      });
    });

    // 既存グラフに既に存在するエッジを除外（重複を避ける）
    const relationshipsToIntegrate = relationshipsBeforeFilter.filter((rel) => {
      const isDuplicate = existingRelationships.some(
        (existingRel) =>
          existingRel.sourceId === rel.sourceId &&
          existingRel.targetId === rel.targetId &&
          existingRel.type === rel.type,
      );
      return !isDuplicate;
    });

    console.log("重複チェック後エッジ数:", relationshipsToIntegrate.length);
    const duplicateCount =
      relationshipsBeforeFilter.length - relationshipsToIntegrate.length;
    if (duplicateCount > 0) {
      console.log(`重複により除外されたエッジ数: ${duplicateCount}`);
    }

    const graphDocumentToIntegrate: GraphDocumentForFrontend = {
      nodes: nodesToIntegrate,
      relationships: relationshipsToIntegrate.map(
        ({
          _originalSourceId,
          _originalTargetId,
          _sourceIdChanged,
          _targetIdChanged,
          ...rel
        }) => rel,
      ),
    };

    console.log("=== 統合送信データ ===");
    console.log("統合送信ノード数:", nodesToIntegrate.length);
    console.log("統合送信エッジ数:", relationshipsToIntegrate.length);
    console.log(
      "統合送信エッジ詳細:",
      relationshipsToIntegrate.map((rel) => ({
        id: rel.id,
        type: rel.type,
        sourceId: rel.sourceId,
        targetId: rel.targetId,
      })),
    );

    integrateGraph.mutate(
      {
        topicSpaceId: topicSpaceId,
        graphDocument: graphDocumentToIntegrate,
      },
      {
        onSuccess: () => {
          setIsIntegrating(false);
          setGraphDocument(null);
          refetch?.();
        },
        onError: (e) => {
          console.log(e);
          setIsIntegrating(false);
        },
      },
    );
  };

  // graph用の変数
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType>();
  const [focusedLink, setFocusedLink] = useState<CustomLinkType>();

  // graph編集用の変数（親から渡されていればそれを使う）
  const [internalAdditionalGraph, setInternalAdditionalGraph] = useState<
    GraphDocumentForFrontend | undefined
  >();
  const additionalGraph =
    controlledAdditionalGraph ?? internalAdditionalGraph;
  const setAdditionalGraph =
    controlledSetAdditionalGraph ?? setInternalAdditionalGraph;

  const [isNodeLinkAttachModalOpen, setIsNodeLinkAttachModalOpen] =
    useState<boolean>(false);
  const [isNodePropertyEditModalOpen, setIsNodePropertyEditModalOpen] =
    useState<boolean>(false);
  const [isLinkPropertyEditModalOpen, setIsLinkPropertyEditModalOpen] =
    useState<boolean>(false);
  const onGraphUpdate = (nextAdditionalGraph: GraphDocumentForFrontend) => {
    console.log("onGraphUpdate", nextAdditionalGraph);
    setAdditionalGraph(nextAdditionalGraph);
    if (!onConfirm) {
      setIsNodeLinkAttachModalOpen(true);
    }
  };

  const onNodeContextMenu = (graphNode: CustomNodeType) => {
    console.log("onNodeContextMenu", graphNode);
    setFocusedNode(graphNode);
    setIsNodePropertyEditModalOpen(true);
  };

  const onLinkContextMenu = (graphLink: CustomLinkType) => {
    console.log("onLinkContextMenu", graphLink);
    setFocusedLink(graphLink);
    setIsLinkPropertyEditModalOpen(true);
  };

  const getMergedGraphForConfirm = (): GraphDocumentForFrontend | null => {
    if (!newGraphDocument) return null;
    return {
      nodes: [
        ...(newGraphDocument.nodes ?? []),
        ...(additionalGraph?.nodes?.map((node) => ({
          ...node,
          isAdditional: true,
        })) ?? []),
      ],
      relationships: [
        ...(newGraphDocument.relationships ?? []),
        ...(additionalGraph?.relationships?.map((r) => ({
          ...r,
          isAdditional: true,
        })) ?? []),
      ],
    };
  };

  const useConfirmButton = !!onConfirm;
  const showTopButtons = !(useConfirmButton && hideConfirmButton);

  return (
    <>
      {showTopButtons && (
        <div className="flex flex-row gap-2">
          {!useConfirmButton && (
            <Button
              onClick={() => setGraphDocument(null)}
              className="!h-8 !w-8 !p-2"
            >
              <div className="h-4 w-4">
                <CrossLargeIcon color="white" width={16} height={16} />
              </div>
            </Button>
          )}
          {useConfirmButton ? (
            <Button
              onClick={() => {
                const toConfirm =
                  controlledSetAdditionalGraph != null
                    ? newGraphDocument
                    : getMergedGraphForConfirm();
                if (toConfirm) onConfirm(toConfirm);
              }}
              className="!px-2 !py-1 !text-sm"
            >
              グラフに反映
            </Button>
          ) : (
            <Button
              onClick={() => submitGraph()}
              disabled={isIntegrating}
              className="!px-2 !py-1 !text-sm"
            >
              {isIntegrating ? <Loading color="white" size={12} /> : "統合"}
            </Button>
          )}
        </div>
      )}

      <ContainerSizeProvider
        containerRef={containerRef}
        setContainerWidth={setContainerWidth}
        className="flex flex-col gap-1 rounded-md border border-gray-600"
      >
        {annotatedGraphDocument && (
          <D3ForceGraph
            svgRef={svgRef}
            currentScale={currentScale}
            setCurrentScale={setCurrentScale}
            focusedNode={focusedNode}
            setFocusedNode={setFocusedNode}
            focusedLink={focusedLink}
            width={containerWidth - 2}
            height={400}
            graphDocument={annotatedGraphDocument}
            isEditor={true}
            isLargeGraph={false}
            setFocusedLink={setFocusedLink}
            toolComponent={<></>}
            onGraphUpdate={onGraphUpdate}
            onNodeContextMenu={onNodeContextMenu}
            onLinkContextMenu={onLinkContextMenu}
            graphIdentifier="additional-graph-viewer"
          />
        )}
      </ContainerSizeProvider>
      {!useConfirmButton && (
        <NodeLinkEditModal
          isOpen={isNodeLinkAttachModalOpen}
          setIsOpen={setIsNodeLinkAttachModalOpen}
          graphDocument={newGraphDocument}
          setGraphDocument={setGraphDocument}
          additionalGraph={additionalGraph}
          setAdditionalGraph={setAdditionalGraph}
        />
      )}
      <NodePropertyEditModal
        isOpen={isNodePropertyEditModalOpen}
        setIsOpen={setIsNodePropertyEditModalOpen}
        graphDocument={newGraphDocument}
        setGraphDocument={setGraphDocument}
        graphNode={focusedNode}
      />
      <LinkPropertyEditModal
        isOpen={isLinkPropertyEditModalOpen}
        setIsOpen={setIsLinkPropertyEditModalOpen}
        graphDocument={newGraphDocument}
        setGraphDocument={setGraphDocument}
        graphLink={focusedLink}
      />
    </>
  );
};

export default AdditionalGraphViewer;
