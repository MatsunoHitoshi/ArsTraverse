"use client";

import React, { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "../../button/button";
import { AnnotationList } from "../../curators-writing-workspace/annotation-list";
import { AnnotationForm } from "../../curators-writing-workspace/annotation-form";
import type { AnnotationResponse, CustomNodeType } from "@/app/const/types";

interface NodeAnnotationSectionProps {
  node: CustomNodeType;
  topicSpaceId: string;
}

export const NodeAnnotationSection: React.FC<NodeAnnotationSectionProps> = ({
  node,
  topicSpaceId,
}) => {
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);

  // ノードの注釈を取得
  const { data: annotations, refetch: refetchAnnotations } =
    api.annotation.getNodeAnnotations.useQuery(
      {
        nodeId: node.id,
      },
      {
        enabled: !!node.id,
      },
    );

  return (
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
        </div>
      </div>

      {/* 注釈一覧 */}
      {annotations && (
        <AnnotationList
          annotations={annotations}
          onRefetch={refetchAnnotations}
          topicSpaceId={topicSpaceId}
        />
      )}

      {/* 注釈フォーム */}
      {showAnnotationForm && (
        <AnnotationForm
          targetType="node"
          targetId={node.id}
          topicSpaceId={topicSpaceId}
          onClose={() => setShowAnnotationForm(false)}
          onSuccess={() => {
            setShowAnnotationForm(false);
            void refetchAnnotations();
          }}
        />
      )}
    </div>
  );
};
