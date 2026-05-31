import React, { useState, useEffect } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import { Modal } from "@/app/_components/modal/modal";
import type {
  CustomNodeType,
  GraphDocumentForFrontend,
} from "@/app/const/types";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { Loading } from "@/app/_components/loading/loading";
import AdditionalGraphViewer from "@/app/_components/view/graph-view/additional-graph-viewer";
import { NodeLinkEditPanel } from "@/app/_components/modal/node-link-edit-panel";

interface AdditionalGraphExtractionModalProps {
  text: string;
  isAdditionalGraphExtractionModalOpen: boolean;
  setIsAdditionalGraphExtractionModalOpen: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  onGraphUpdate?: (additionalGraph: GraphDocumentForFrontend) => void;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
  entities: CustomNodeType[];
  centralSubject?: CustomNodeType;
  /** 追加グラフを可視化する際の既存グラフ取得用（未指定でも抽出・反映は可能） */
  topicSpaceId?: string;
}

export const AdditionalGraphExtractionModal: React.FC<
  AdditionalGraphExtractionModalProps
> = ({
  text,
  isAdditionalGraphExtractionModalOpen,
  setIsAdditionalGraphExtractionModalOpen,
  onGraphUpdate,
  setIsGraphEditor,
  entities,
  centralSubject,
  topicSpaceId = "",
}) => {
    const [isExtracting, setIsExtracting] = useState(false);
    /** 抽出完了後に表示するグラフ（未設定のときはテキスト＋抽出ボタンのみ） */
    const [extractedGraph, setExtractedGraph] =
      useState<GraphDocumentForFrontend | null>(null);
    /** グラフビュー・一覧で表示・編集するグラフ（抽出結果＋グラフ上で追加した分をすべて含む） */
    const [displayGraph, setDisplayGraph] =
      useState<GraphDocumentForFrontend | null>(null);
    /** モーダル内タブ: グラフビュー（編集） / 一覧（編集） */
    const [activeTab, setActiveTab] = useState<"graph" | "list">("graph");

    useEffect(() => {
      if (extractedGraph != null) setDisplayGraph(extractedGraph);
    }, [extractedGraph]);

    const mergeIntoDisplayGraph = (
      prev: GraphDocumentForFrontend | null,
      additional: GraphDocumentForFrontend,
    ): GraphDocumentForFrontend => {
      if (!prev) return additional;
      return {
        nodes: [
          ...(prev.nodes ?? []),
          ...(additional.nodes?.map((n) => ({ ...n, isAdditional: true })) ?? []),
        ],
        relationships: [
          ...(prev.relationships ?? []),
          ...(additional.relationships?.map((r) => ({ ...r, isAdditional: true })) ?? []),
        ],
      };
    };

    const extractKG = api.kg.extractKG.useMutation();

    const { data: relatedGraphData } = api.kg.getRelatedNodes.useQuery(
      {
        nodeId: centralSubject?.id ?? "",
        contextId: centralSubject?.topicSpaceId ?? "",
        contextType: "topicSpace",
      },
      {
        enabled: !!centralSubject?.id && !!centralSubject?.topicSpaceId,
        staleTime: Infinity,
      },
    );

    const handleExtractGraph = async () => {
      if (!text.trim()) {
        alert("テキストが選択されていません");
        return;
      }

      // 隣接ノード情報の構築
      let contextPrompt = "";
      if (centralSubject && relatedGraphData) {
        const relationships = relatedGraphData.relationships.filter(
          (r) =>
            r.sourceId === centralSubject.id || r.targetId === centralSubject.id,
        );

        const relationshipDescriptions: string[] = [];

        relationships.forEach((rel) => {
          const isSource = rel.sourceId === centralSubject.id;
          const otherNodeId = isSource ? rel.targetId : rel.sourceId;
          const otherNode = relatedGraphData.nodes.find(
            (n) => n.id === otherNodeId,
          );

          if (otherNode) {
            const relationStr = isSource
              ? `"${centralSubject.name}" --[${rel.type}]--> "${otherNode.name}"(${otherNode.label})`
              : `"${otherNode.name}"(${otherNode.label}) --[${rel.type}]--> "${centralSubject.name}"`;
            relationshipDescriptions.push(relationStr);
          }
        });

        const uniqueRelationships = Array.from(new Set(relationshipDescriptions));

        if (uniqueRelationships.length > 0) {
          contextPrompt = `\n\nExisting Graph Context (use these connections as reference):\n${uniqueRelationships.join("\n")}\n\nIf any of these existing nodes appear in the text, use their exact names to connect them. Also, look for relationships between these existing nodes and any NEW nodes you extract, or refine existing relationships if the text provides more detail.`;
        }
      }

      setIsExtracting(true);

      try {
        // 一時的なファイルとしてテキストを処理
        const blob = new Blob([text], { type: "text/plain" });

        // Supabaseストレージにアップロード
        const fileUrl = await storageUtils.uploadFromBlob(
          blob,
          BUCKETS.PATH_TO_INPUT_TXT,
        );

        extractKG.mutate(
          {
            fileUrl,
            isPlaneTextMode: true,
            extractMode: "langChain",
            additionalPrompt: centralSubject
              ? `The text starts with 'Node: ${centralSubject.name}(${centralSubject.label})', which identifies the CENTRAL SUBJECT. You MUST extract this central subject as a node. CRITICAL: Do not stop there. You MUST analyze the entire text to extract ALL other relevant entities, concepts, and attributes as SEPARATE nodes. Then, create meaningful RELATIONSHIPS connecting the central subject to these other nodes. ADDITIONALLY, identify and extract relationships BETWEEN the other extracted nodes to create a rich, interconnected graph structure, not just a star shape centered on the subject. The goal is to build a comprehensive graph centered around the specified node but including all relevant internal connections.${contextPrompt}`
              : "",
          },
          {
            onSuccess: (data) => {
              if (data?.data?.graph) {
                const mergedGraph = mergeWithExistingEntities(
                  data.data.graph,
                  entities,
                );
                setExtractedGraph(mergedGraph);
              }
              setIsExtracting(false);
            },
            onError: (error) => {
              console.error("グラフ抽出エラー:", error);
              alert("グラフ抽出に失敗しました");
              setIsExtracting(false);
            },
          },
        );
      } catch (error) {
        console.error("グラフ抽出エラー:", error);
      }
    };

    // 既存のエンティティと重複するノードを統合する関数
    const mergeWithExistingEntities = (
      extractedGraph: GraphDocumentForFrontend,
      existingEntities: CustomNodeType[],
    ): GraphDocumentForFrontend => {
      // entitiesがundefinedまたは空の場合は、そのまま返す
      if (!existingEntities || existingEntities.length === 0) {
        console.log(
          "No existing entities to merge with, returning original graph",
        );
        return extractedGraph;
      }

      const mergedNodes = [...extractedGraph.nodes];
      const mergedRelationships = [...extractedGraph.relationships];
      const nodeMapping = new Map<string, string>(); // 新しいID -> 既存のID

      // 既存のエンティティと名前・タイプが一致するノードを検索
      extractedGraph.nodes.forEach((extractedNode) => {
        const matchingEntity = existingEntities.find(
          (entity) =>
            entity.name === extractedNode.name &&
            entity.label === extractedNode.label,
        );

        if (matchingEntity) {
          // 重複するノードをマッピング
          nodeMapping.set(extractedNode.id, matchingEntity.id);

          // 抽出されたノードを既存のエンティティ情報で置換（IDを合わせるため）
          // これにより、リンクの端点となるノードがグラフデータに含まれることが保証される
          const nodeIndex = mergedNodes.findIndex(
            (node) => node.id === extractedNode.id,
          );
          if (nodeIndex !== -1) {
            mergedNodes[nodeIndex] = { ...matchingEntity };
          }
        }
      });

      // リレーションシップの参照を更新
      mergedRelationships.forEach((relationship) => {
        // ソースノードの参照を更新
        if (nodeMapping.has(relationship.sourceId)) {
          relationship.sourceId = nodeMapping.get(relationship.sourceId)!;
        }

        // ターゲットノードの参照を更新
        if (nodeMapping.has(relationship.targetId)) {
          relationship.targetId = nodeMapping.get(relationship.targetId)!;
        }
      });

      return {
        ...extractedGraph,
        nodes: mergedNodes,
        relationships: mergedRelationships,
      };
    };

    const handleClose = () => {
      setExtractedGraph(null);
      setDisplayGraph(null);
      setActiveTab("graph");
      setIsAdditionalGraphExtractionModalOpen(false);
    };

    return (
      <Modal
        isOpen={isAdditionalGraphExtractionModalOpen}
        setIsOpen={(value) => {
          const next = typeof value === "function" ? value(true) : value;
          if (!next) {
            setExtractedGraph(null);
            setDisplayGraph(null);
            setActiveTab("graph");
          }
          setIsAdditionalGraphExtractionModalOpen(next);
        }}
        title="テキストからグラフ抽出"
        size="large"
      >
        <div className="flex flex-col gap-6">
          {extractedGraph == null ? (
            <>
              <div>
                <h4 className="mb-2 text-sm font-medium text-slate-200">
                  選択されたテキスト
                </h4>
                <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-800 p-3 text-sm text-slate-300">
                  {text ?? "テキストが選択されていません"}
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={handleExtractGraph}
                  disabled={isExtracting || !text.trim()}
                  className="px-6"
                >
                  {isExtracting ? (
                    <Loading color="white" size={20} />
                  ) : (
                    "グラフを抽出"
                  )}
                </Button>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  onClick={handleClose}
                  className="border border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600"
                >
                  キャンセル
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-300">
                抽出されたグラフを確認・編集できます。タブでグラフビューと一覧を切り替え、「グラフに反映」で元のグラフに追加します。
              </p>
              <div className="flex border-b border-slate-600">
                <button
                  type="button"
                  onClick={() => setActiveTab("graph")}
                  className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === "graph"
                    ? "border-b-2 border-slate-400 bg-slate-800 text-white"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    }`}
                >
                  グラフビュー
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("list")}
                  className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${activeTab === "list"
                    ? "border-b-2 border-slate-400 bg-slate-800 text-white"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    }`}
                >
                  一覧
                </button>
              </div>
              <div className="min-h-[420px]">
                {activeTab === "graph" && (
                  <AdditionalGraphViewer
                    topicSpaceId={topicSpaceId}
                    refetch={() => undefined}
                    newGraphDocument={displayGraph}
                    setGraphDocument={setDisplayGraph}
                    onConfirm={(graph) => {
                      if (onGraphUpdate) {
                        onGraphUpdate(graph);
                        handleClose();
                        setIsGraphEditor(true);
                      }
                    }}
                    hideConfirmButton
                    additionalGraph={undefined}
                    setAdditionalGraph={(action) => {
                      const additional =
                        typeof action === "function" ? action(undefined) : action;
                      if (additional != null) {
                        setDisplayGraph((prev) =>
                          mergeIntoDisplayGraph(prev, additional),
                        );
                      }
                    }}
                  />
                )}
                {activeTab === "list" && (
                  <div className="flex flex-col overflow-y-auto p-4">
                    <NodeLinkEditPanel
                      graphDocument={displayGraph}
                      setGraphDocument={setDisplayGraph}
                      additionalGraph={undefined}
                      setAdditionalGraph={() => undefined}
                      showFooter={false}
                      showFullGraph
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={handleClose}
                  className="border border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={() => {
                    if (onGraphUpdate && displayGraph) {
                      onGraphUpdate(displayGraph);
                      handleClose();
                      setIsGraphEditor(true);
                    }
                  }}
                >
                  グラフに反映
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    );
  };
