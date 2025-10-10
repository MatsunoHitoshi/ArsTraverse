"use client";

import React, { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import { AnnotationList } from "./annotation-list";
import { AnnotationForm } from "./annotation-form";
import { AnnotationGraphExtractionModal } from "./annotation-graph-extraction-modal";
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
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [showGraphExtractionModal, setShowGraphExtractionModal] =
    useState(false);

  // ノードの注釈を取得
  const { data: annotations, refetch: refetchAnnotations } =
    api.workspace.getWorkspaceNodeAnnotations.useQuery(
      {
        nodeId: activeEntity?.id ?? "",
        workspaceId,
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
        <hr className="my-4" />
      </div>

      {/* 注釈セクション */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-gray-400">注釈</h3>
          <div className="flex gap-2">
            <Button
              size="small"
              onClick={() => setShowAnnotationForm(true)}
              className="text-xs"
            >
              注釈を追加
            </Button>
            {/* {annotations && annotations.length > 0 && (
              <Button
                size="small"
                onClick={() => setShowGraphExtractionModal(true)}
                className="border border-gray-600 text-xs"
              >
                グラフ抽出
              </Button>
            )} */}
          </div>
        </div>

        {/* 注釈一覧 */}
        <AnnotationList
          annotations={annotations as AnnotationResponse[]}
          onRefetch={refetchAnnotations}
          topicSpaceId={topicSpaceId}
        />
      </div>

      {/* 注釈フォーム */}
      {showAnnotationForm && (
        <AnnotationForm
          targetType="node"
          targetId={activeEntity.id}
          topicSpaceId={topicSpaceId}
          onClose={() => setShowAnnotationForm(false)}
          onSuccess={() => {
            setShowAnnotationForm(false);
            void refetchAnnotations();
          }}
        />
      )}

      {/* グラフ抽出モーダル */}
      {showGraphExtractionModal && (
        <AnnotationGraphExtractionModal
          annotations={annotations as AnnotationResponse[]}
          topicSpaceId={topicSpaceId}
          onClose={() => setShowGraphExtractionModal(false)}
        />
      )}
    </div>
  );
};
