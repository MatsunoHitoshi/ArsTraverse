"use client";

import React from "react";
import { api } from "@/trpc/react";
import { Button } from "../button/button";

interface AnnotationHistoryModalProps {
  annotationId: string;
  onClose: () => void;
}

export const AnnotationHistoryModal: React.FC<AnnotationHistoryModalProps> = ({
  annotationId,
  onClose,
}) => {
  const { data: histories, isLoading } =
    api.annotation.getAnnotationHistory.useQuery({
      annotationId,
    });

  const getChangeTypeLabel = (changeType: string) => {
    switch (changeType) {
      case "CREATED":
        return "作成";
      case "UPDATED":
        return "更新";
      case "DELETED":
        return "削除";
      case "RESTORED":
        return "復元";
      case "TYPE_CHANGED":
        return "タイプ変更";
      default:
        return changeType;
    }
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case "CREATED":
        return "bg-green-100 text-green-800";
      case "UPDATED":
        return "bg-blue-100 text-blue-800";
      case "DELETED":
        return "bg-red-100 text-red-800";
      case "RESTORED":
        return "bg-yellow-100 text-yellow-800";
      case "TYPE_CHANGED":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
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

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="w-full max-w-2xl rounded-lg bg-white p-6">
          <div className="text-center">読み込み中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold">注釈履歴</h3>
          <Button onClick={onClose} className="bg-gray-200 text-gray-800">
            ×
          </Button>
        </div>

        {histories && histories.length > 0 ? (
          <div className="space-y-4">
            {histories.map((history) => (
              <div
                key={history.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${getChangeTypeColor(
                      history.changeType,
                    )}`}
                  >
                    {getChangeTypeLabel(history.changeType)}
                  </span>
                  <span className="text-sm text-gray-600">
                    {history.changedBy.name}
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatDate(history.createdAt)}
                  </span>
                </div>

                {history.changeReason && (
                  <div className="mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      変更理由:
                    </span>
                    <span className="ml-2 text-sm text-gray-600">
                      {history.changeReason}
                    </span>
                  </div>
                )}

                {history.changeComment && (
                  <div className="mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      コメント:
                    </span>
                    <span className="ml-2 text-sm text-gray-600">
                      {history.changeComment}
                    </span>
                  </div>
                )}

                {/* 変更内容の差分表示 */}
                {(history.previousContent ?? history.currentContent) && (
                  <div className="mt-3">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {history.previousContent && (
                        <div>
                          <h5 className="mb-1 text-sm font-medium text-gray-700">
                            変更前
                          </h5>
                          <div className="rounded border bg-red-50 p-2 text-xs text-gray-600">
                            {typeof history.previousContent === "string"
                              ? history.previousContent
                              : JSON.stringify(history.previousContent)}
                          </div>
                        </div>
                      )}
                      {history.currentContent && (
                        <div>
                          <h5 className="mb-1 text-sm font-medium text-gray-700">
                            変更後
                          </h5>
                          <div className="rounded border bg-green-50 p-2 text-xs text-gray-600">
                            {typeof history.currentContent === "string"
                              ? history.currentContent
                              : JSON.stringify(history.currentContent)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">履歴がありません</div>
        )}
      </div>
    </div>
  );
};
