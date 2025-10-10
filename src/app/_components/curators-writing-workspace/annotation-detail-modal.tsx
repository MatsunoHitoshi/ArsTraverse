"use client";

import React, { useState } from "react";
import type { AnnotationType } from "@prisma/client";
import { Button } from "../button/button";
import { AnnotationForm } from "./annotation-form";
import { AnnotationHistoryModal } from "./annotation-history-modal";
import type { AnnotationResponse } from "@/app/const/types";
import { convertJsonToText } from "@/app/_utils/tiptap/convert";

interface AnnotationDetailModalProps {
  annotation: AnnotationResponse;
  onClose: () => void;
  onRefetch: () => void;
  topicSpaceId: string;
}

export const AnnotationDetailModal: React.FC<AnnotationDetailModalProps> = ({
  annotation,
  onClose,
  onRefetch,
  topicSpaceId,
}) => {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const getAnnotationTypeColor = (type: AnnotationType) => {
    switch (type) {
      case "COMMENT":
        return "bg-blue-100 text-blue-800";
      case "INTERPRETATION":
        return "bg-purple-100 text-purple-800";
      case "QUESTION":
        return "bg-yellow-100 text-yellow-800";
      case "CLARIFICATION":
        return "bg-green-100 text-green-800";
      case "CRITICISM":
        return "bg-red-100 text-red-800";
      case "SUPPORT":
        return "bg-emerald-100 text-emerald-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getAnnotationTypeLabel = (type: AnnotationType) => {
    switch (type) {
      case "COMMENT":
        return "コメント";
      case "INTERPRETATION":
        return "解釈";
      case "QUESTION":
        return "質問";
      case "CLARIFICATION":
        return "補足";
      case "CRITICISM":
        return "批評";
      case "SUPPORT":
        return "支持";
      default:
        return type;
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold">注釈詳細</h3>
          <Button onClick={onClose} className="bg-gray-200 text-gray-800">
            ×
          </Button>
        </div>

        {/* 注釈ヘッダー */}
        <div className="mb-4 flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${getAnnotationTypeColor(
              annotation.type,
            )}`}
          >
            {getAnnotationTypeLabel(annotation.type)}
          </span>
          <span className="text-sm text-gray-600">
            {annotation.author.name}
          </span>
          <span className="text-sm text-gray-500">
            {formatDate(annotation.createdAt)}
          </span>
        </div>

        {/* 注釈内容 */}
        <div className="mb-6">
          <div className="prose prose-sm max-w-none">
            {convertJsonToText(annotation.content)}
          </div>
        </div>

        {/* アクションボタン */}
        <div className="mb-6 flex gap-2">
          <Button size="small" onClick={() => setShowReplyForm(true)}>
            返信
          </Button>
          <Button
            size="small"
            onClick={() => setShowHistory(true)}
            className="border border-gray-300"
          >
            履歴
          </Button>
        </div>

        {/* 子注釈 */}
        {annotation.childAnnotations &&
          annotation.childAnnotations.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="mb-3 font-medium">
                返信 ({annotation.childAnnotations.length}件)
              </h4>
              <div className="space-y-3">
                {annotation.childAnnotations.map((child) => (
                  <div
                    key={child.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        {child.author.name}
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatDate(child.createdAt)}
                      </span>
                    </div>
                    <div className="text-sm">
                      {convertJsonToText(child.content)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* 返信フォーム */}
        {showReplyForm && annotation.id && (
          <AnnotationForm
            targetType="annotation"
            targetId={annotation.id}
            topicSpaceId={topicSpaceId}
            parentAnnotationId={annotation.id}
            onClose={() => setShowReplyForm(false)}
            onSuccess={() => {
              setShowReplyForm(false);
              void onRefetch();
            }}
          />
        )}

        {/* 履歴モーダル */}
        {showHistory && (
          <AnnotationHistoryModal
            annotationId={annotation.id}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </div>
  );
};
