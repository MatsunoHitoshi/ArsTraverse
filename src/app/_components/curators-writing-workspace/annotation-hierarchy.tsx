"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { RelativeTimeWithTooltip } from "./relative-time-with-tooltip";
import { convertJsonToText } from "@/app/_utils/tiptap/convert";
import {
  getAnnotationTypeColor,
  getAnnotationTypeLabel,
} from "@/app/_utils/annotation/type-utils";
import { AnnotationEditForm } from "./annotation-edit-form";
import type { AnnotationResponse } from "@/app/const/types";
import { Button } from "../button/button";

interface AnnotationHierarchyProps {
  currentAnnotation: AnnotationResponse;
  parentAnnotation?: AnnotationResponse | null;
  childAnnotations: AnnotationResponse[];
  onRefetch: () => void;
  topicSpaceId: string;
  setShowAnnotationForm: React.Dispatch<React.SetStateAction<boolean>>;
}

export const AnnotationHierarchy: React.FC<AnnotationHierarchyProps> = ({
  currentAnnotation,
  parentAnnotation,
  childAnnotations,
  onRefetch,
  topicSpaceId,
  setShowAnnotationForm,
}) => {
  const { data: session } = useSession();
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingAnnotation, setEditingAnnotation] =
    useState<AnnotationResponse | null>(null);

  const handleEditClick = (annotation: AnnotationResponse) => {
    setEditingAnnotation(annotation);
    setShowEditForm(true);
  };

  const handleEditSuccess = () => {
    setShowEditForm(false);
    setEditingAnnotation(null);
    onRefetch();
  };

  const handleEditClose = () => {
    setShowEditForm(false);
    setEditingAnnotation(null);
  };

  const renderAnnotationCard = (
    annotation: AnnotationResponse,
    isCurrent = false,
    level: "parent" | "current" | "child" = "current",
  ) => {
    const cardClasses = isCurrent
      ? "border-orange-600 bg-orange-900/20"
      : level === "parent"
        ? "border-gray-500 bg-slate-700/50"
        : "border-gray-600 bg-slate-800";

    if (isCurrent) {
      return (
        <div
          key={annotation.id}
          className={`block rounded-lg border-2 p-4 transition-colors hover:bg-opacity-80 ${cardClasses}`}
        >
          {/* ヘッダー */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image
                alt=""
                src={annotation.author.image ?? ""}
                height={24}
                width={24}
                className="rounded-full border border-gray-600"
              />
              <span className="text-sm font-medium text-gray-200">
                {annotation.author.name}
              </span>
              <RelativeTimeWithTooltip
                datetime={annotation.createdAt}
                className="text-xs text-gray-500"
              />
            </div>
            <div className="flex gap-1">
              {session?.user?.id === annotation.author.id && (
                <button
                  className="flex h-6 flex-row items-center justify-center rounded bg-blue-700 px-2 text-xs hover:bg-blue-600"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleEditClick(annotation);
                  }}
                >
                  編集
                </button>
              )}
            </div>
          </div>

          {/* 注釈タイプ */}
          <div className="mb-3">
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getAnnotationTypeColor(
                annotation.type,
              )}`}
            >
              {getAnnotationTypeLabel(annotation.type)}
            </span>
          </div>

          {/* 内容 */}
          <div className="text-sm text-gray-200">
            <div
              dangerouslySetInnerHTML={{
                __html: convertJsonToText(annotation.content),
              }}
            />
          </div>

          {/* レベル表示 */}
          <div className="mt-3 text-xs text-gray-400">
            {level === "parent" && "↑ 親注釈"}
            {level === "current" && "→ 現在の注釈"}
            {level === "child" && "↓ 子注釈"}
          </div>
        </div>
      );
    }

    return (
      <Link
        key={annotation.id}
        href={`/annotations/${annotation.id}`}
        className={`block rounded-lg border-2 p-4 transition-colors hover:bg-opacity-80 ${cardClasses} cursor-pointer`}
      >
        {/* ヘッダー */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              alt=""
              src={annotation.author.image ?? ""}
              height={24}
              width={24}
              className="rounded-full border border-gray-600"
            />
            <span className="text-sm font-medium text-gray-200">
              {annotation.author.name}
            </span>
            <RelativeTimeWithTooltip
              datetime={annotation.createdAt}
              className="text-xs text-gray-500"
            />
          </div>
          <div className="flex gap-1">
            <button
              className="flex h-6 flex-row items-center justify-center rounded bg-gray-700 px-2 text-xs hover:bg-gray-600"
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = `/annotations/${annotation.id}`;
              }}
            >
              詳細
            </button>
          </div>
        </div>

        {/* 注釈タイプ */}
        <div className="mb-3">
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getAnnotationTypeColor(
              annotation.type,
            )}`}
          >
            {getAnnotationTypeLabel(annotation.type)}
          </span>
        </div>

        {/* 内容 */}
        <div className="text-sm text-gray-200">
          <div
            dangerouslySetInnerHTML={{
              __html: convertJsonToText(annotation.content),
            }}
          />
        </div>

        {/* レベル表示 */}
        <div className="mt-3 text-xs text-gray-400">
          {level === "parent" && "↑ 親注釈"}
          {level === "current" && "→ 現在の注釈"}
          {level === "child" && "↓ 子注釈"}
        </div>
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      {/* 親注釈 */}
      {parentAnnotation && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-300">親注釈</h4>
          {renderAnnotationCard(parentAnnotation, false, "parent")}
        </div>
      )}

      {/* 現在の注釈 */}
      <div>
        <h4 className="-mt-4 flex h-12 flex-row items-end text-sm font-medium text-gray-300">
          <div className="pb-2">現在の注釈</div>
          {parentAnnotation && (
            <div className="ml-12 h-12 border-l-4 border-gray-500"></div>
          )}
        </h4>
        {renderAnnotationCard(currentAnnotation, true, "current")}
      </div>

      {/* 子注釈 */}
      {childAnnotations?.length > 0 && (
        <div className="ml-2 border-l-2 border-gray-600 pl-4">
          <div className="mb-2 flex flex-row items-center justify-between">
            <h4 className="mb-2 text-sm font-medium text-gray-300">
              子注釈 ({childAnnotations.length}件)
            </h4>
            <Button
              size="small"
              onClick={() => setShowAnnotationForm(true)}
              className="hover:bg-slate-600"
            >
              返信を追加
            </Button>
          </div>

          <div className="space-y-3">
            {childAnnotations.map((child) =>
              renderAnnotationCard(child, false, "child"),
            )}
          </div>
        </div>
      )}

      {/* 子注釈がない場合 */}
      {childAnnotations?.length === 0 && (
        <div className="ml-2 border-l-2 border-gray-600 pl-4">
          <div className="rounded-lg border border-gray-600 bg-slate-800 p-4">
            <p className="text-center text-sm text-gray-400">
              まだ子注釈がありません
            </p>
          </div>
        </div>
      )}

      {/* 編集フォーム */}
      {showEditForm && editingAnnotation && (
        <AnnotationEditForm
          annotation={editingAnnotation}
          onClose={handleEditClose}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
};
