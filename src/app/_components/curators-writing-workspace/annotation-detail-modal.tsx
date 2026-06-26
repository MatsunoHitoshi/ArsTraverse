"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "../button/button";
import { AnnotationForm } from "./annotation-form";
import { AnnotationHistoryModal } from "./annotation-history-modal";
import type { AnnotationResponse } from "@/app/const/types";
import { convertJsonToText } from "@/app/_utils/tiptap/convert";
import { ReplyIcon } from "../icons";
import {
  getAnnotationTypeColor,
} from "@/app/_utils/annotation/type-utils";
import { useAnnotationTypeLabel } from "@/app/_utils/annotation/use-annotation-type-label";

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
  const t = useTranslations("annotation");
  const tCommon = useTranslations("common");
  const getTypeLabel = useAnnotationTypeLabel();
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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
          <h3 className="text-lg font-semibold">{t("annotationDetail")}</h3>
          <Button onClick={onClose} className="bg-gray-200 text-gray-800">
            ×
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${getAnnotationTypeColor(
              annotation.type,
            )}`}
          >
            {getTypeLabel(annotation.type)}
          </span>
          <span className="text-sm text-gray-600">
            {annotation.author.name}
          </span>
          <span className="text-sm text-gray-500">
            {formatDate(annotation.createdAt)}
          </span>
        </div>

        <div className="mb-6">
          <div className="prose prose-sm max-w-none">
            {convertJsonToText(annotation.content)}
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          <Button
            size="small"
            onClick={() => setShowReplyForm(true)}
            className="flex flex-row items-center justify-center gap-1"
          >
            <ReplyIcon width={16} height={16} color="white" />
            {tCommon("reply")}
          </Button>
          <Button
            size="small"
            onClick={() => setShowHistory(true)}
            className="border border-gray-300"
          >
            {tCommon("history")}
          </Button>
        </div>

        {annotation.childAnnotations &&
          annotation.childAnnotations.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="mb-3 font-medium">
                {t("replyCount", {
                  count: annotation.childAnnotations.length,
                })}
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

        <AnnotationForm
          targetType="annotation"
          targetId={annotation.id || ""}
          topicSpaceId={topicSpaceId}
          parentAnnotationId={annotation.id}
          isOpen={showReplyForm && !!annotation.id}
          setIsOpen={setShowReplyForm}
          onSuccess={() => {
            void onRefetch();
          }}
        />

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
