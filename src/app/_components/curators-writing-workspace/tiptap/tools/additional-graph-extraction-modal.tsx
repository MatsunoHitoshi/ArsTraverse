import React, { useState } from "react";
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

interface AdditionalGraphExtractionModalProps {
  text: string;
  isAdditionalGraphExtractionModalOpen: boolean;
  setIsAdditionalGraphExtractionModalOpen: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  onGraphUpdate?: (additionalGraph: GraphDocumentForFrontend) => void;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
  entities: CustomNodeType[];
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
}) => {
  const [extractedGraph, setExtractedGraph] =
    useState<GraphDocumentForFrontend | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  const extractKG = api.kg.extractKG.useMutation();

  const handleExtractGraph = async () => {
    if (!text.trim()) {
      alert("テキストが選択されていません");
      return;
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
          additionalPrompt:
            "If the text contains a 'Node: [name]([label])', extract the node as a primary node in the graph.",
        },
        {
          onSuccess: (data) => {
            if (data?.data?.graph) {
              // 既存のエンティティと重複するノードを統合
              console.log("data.data.graph\n", data.data.graph);
              const mergedGraph = mergeWithExistingEntities(
                data.data.graph,
                entities,
              );
              console.log("mergedGraph\n", mergedGraph);
              setExtractedGraph(mergedGraph);
              if (onGraphUpdate) {
                onGraphUpdate(mergedGraph);
                setIsAdditionalGraphExtractionModalOpen(false);
                setIsGraphEditor(true);
              }
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

        // 抽出されたノードを削除
        const nodeIndex = mergedNodes.findIndex(
          (node) => node.id === extractedNode.id,
        );
        if (nodeIndex !== -1) {
          mergedNodes.splice(nodeIndex, 1);
        }

        // 既存のエンティティノードは追加しない（編集用の追加データとして）
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

  return (
    <Modal
      isOpen={isAdditionalGraphExtractionModalOpen}
      setIsOpen={setIsAdditionalGraphExtractionModalOpen}
      title="テキストからグラフ抽出"
      size="large"
    >
      <div className="flex flex-col gap-6">
        <div>
          <h4 className="mb-2 text-sm font-medium text-slate-200">
            選択されたテキスト
          </h4>
          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-800 p-3 text-sm text-slate-300">
            {text ?? "テキストが選択されていません"}
          </div>
        </div>

        {/* 抽出ボタン */}
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

        {/* アクションボタン */}
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => setIsAdditionalGraphExtractionModalOpen(false)}
            className="border border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600"
          >
            キャンセル
          </Button>
        </div>
      </div>
    </Modal>
  );
};
