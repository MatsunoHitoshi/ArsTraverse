import React from "react";
import { NodeAnnotationSection } from "../view/node/node-annotation-section";
import { NodeImageFormSection } from "../form/node-image-form-section";
import type {
  CustomNodeType,
  GraphDocumentForFrontend,
} from "@/app/const/types";

interface NodeDetailPanelProps {
  activeEntity: CustomNodeType | undefined;
  topicSpaceId: string;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
  onGraphUpdate: (additionalGraph: GraphDocumentForFrontend) => void;
  /** 画像保存時にグラフを更新するために必要。null の場合は onGraphUpdate は呼ばない */
  currentGraph?: GraphDocumentForFrontend | null;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  activeEntity,
  topicSpaceId,
  setFocusedNode,
  setIsGraphEditor,
  onGraphUpdate,
  currentGraph,
}) => {
  if (!activeEntity) {
    return (
      <div className="min-h-full rounded-b-lg border border-gray-300 bg-slate-900 p-4 shadow-sm">
        <h2 className="text-md mb-4 font-semibold text-gray-400">詳細</h2>
        <p className="text-gray-300">
          Editor内でハイライトされたエンティティをクリックすると詳細が表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-scroll rounded-b-lg border border-gray-300 bg-slate-900 p-4 shadow-sm">
      {/* ノード情報 */}
      <div className="text-white">
        <h3 className="font-semibold text-white">{activeEntity.name}</h3>
        <p className="text-sm text-gray-400">{activeEntity.label}</p>
        <p className="mt-2 text-sm">
          {String(activeEntity.properties?.description ?? "No description")}
        </p>

        {/* ノード画像の挿入・変更・削除 */}
        <div className="mt-3">
          <NodeImageFormSection
            topicSpaceId={topicSpaceId}
            node={activeEntity}
            onSaveSuccess={(updatedNode) => {
              if (currentGraph) {
                const newGraph: GraphDocumentForFrontend = {
                  nodes: currentGraph.nodes.map((n) =>
                    n.id === updatedNode.id ? updatedNode : n,
                  ),
                  relationships: currentGraph.relationships,
                };
                onGraphUpdate(newGraph);
              }
            }}
          />
        </div>

        <div className="my-3 border-b border-gray-400" />
      </div>

      {/* 注釈セクション */}
      <NodeAnnotationSection
        node={activeEntity}
        topicSpaceId={topicSpaceId}
        setFocusedNode={setFocusedNode}
        setIsGraphEditor={setIsGraphEditor}
        onGraphUpdate={onGraphUpdate}
      />
    </div>
  );
};
