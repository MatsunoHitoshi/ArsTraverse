"use client";

import React, { useState } from "react";
import { api } from "@/trpc/react";
import { AnnotationGraphExtractionModal } from "./annotation-graph-extraction-modal";
import { NodeAnnotationSection } from "../view/node/node-annotation-section";
import type { AnnotationResponse, CustomNodeType } from "@/app/const/types";

interface NodeDetailPanelProps {
  activeEntity: CustomNodeType | undefined;
  workspaceId: string;
  topicSpaceId: string;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({
  activeEntity,
  workspaceId,
  topicSpaceId,
}) => {
  const [showGraphExtractionModal, setShowGraphExtractionModal] =
    useState(false);

  // ノードの注釈を取得（グラフ抽出用）
  const { data: annotations, refetch: refetchAnnotations } =
    api.annotation.getNodeAnnotations.useQuery(
      {
        nodeId: activeEntity?.id ?? "",
      },
      {
        enabled: !!activeEntity?.id,
      },
    );

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
        <div className="my-4 border-b border-gray-400" />
      </div>

      {/* 注釈セクション */}
      <NodeAnnotationSection node={activeEntity} topicSpaceId={topicSpaceId} />

      {/* グラフ抽出モーダル */}
      {showGraphExtractionModal && annotations && (
        <AnnotationGraphExtractionModal
          annotations={annotations}
          topicSpaceId={topicSpaceId}
          onClose={() => setShowGraphExtractionModal(false)}
        />
      )}
    </div>
  );
};
