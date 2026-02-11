import React, { useState } from "react";
import { Button } from "../button/button";
import type {
  AnnotationResponse,
  CustomNodeType,
  GraphDocumentForFrontend,
} from "@/app/const/types";
import { convertJsonToText } from "@/app/_utils/tiptap/convert";
import { AnnotationForm } from "./annotation-form";
import Image from "next/image";
import { RelativeTimeWithTooltip } from "./relative-time-with-tooltip";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import {
  getAnnotationTypeColor,
  getAnnotationTypeLabel,
} from "@/app/_utils/annotation/type-utils";
import { PlusIcon, ReplyIcon } from "../icons";
import { HighlightedText } from "../common/highlighted-text";
import { api } from "@/trpc/react";
import { AdditionalGraphExtractionModal } from "./tiptap/tools/additional-graph-extraction-modal";

interface AnnotationListProps {
  annotations: AnnotationResponse[];
  onRefetch: () => void;
  topicSpaceId: string;
  showOnlyTopLevel?: boolean; // トップレベルの注釈のみを表示するかどうか
  handleGenerateAnnotationFromDocument?: () => void;
  setFocusedNode: React.Dispatch<
    React.SetStateAction<CustomNodeType | undefined>
  >;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
  onGraphUpdate: (additionalGraph: GraphDocumentForFrontend) => void;
  node: CustomNodeType;
}

export const AnnotationList: React.FC<AnnotationListProps> = ({
  annotations,
  node,
  onRefetch,
  topicSpaceId,
  showOnlyTopLevel = true,
  handleGenerateAnnotationFromDocument,
  setFocusedNode,
  setIsGraphEditor,
  onGraphUpdate,
}) => {
  const [parentAnnotationId, setParentAnnotationId] = useState<string | null>(
    null,
  );
  const [annotationText, setAnnotationText] = useState<string>("");
  const [
    showAdditionalGraphExtractionModal,
    setShowAdditionalGraphExtractionModal,
  ] = useState(false);
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    new Set(),
  );

  // トピックスペースのノードデータを取得（ハイライト用）
  const { data: topicSpaceData } = api.topicSpaces.getByIdPublic.useQuery(
    { id: topicSpaceId },
    { enabled: !!topicSpaceId },
  );

  const entities = topicSpaceData?.graphData?.nodes ?? [];

  const handleReply = (annotationId: string) => {
    setParentAnnotationId(annotationId);
    setShowAnnotationForm(true);
  };

  const toggleReplies = (annotationId: string) => {
    setExpandedReplies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(annotationId)) {
        newSet.delete(annotationId);
      } else {
        newSet.add(annotationId);
      }
      return newSet;
    });
  };

  // 表示する注釈を決定
  const displayAnnotations = showOnlyTopLevel
    ? (annotations?.filter((annotation) => !annotation.parentAnnotationId) ??
      [])
    : (annotations ?? []);

  if (displayAnnotations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <p className="mb-2 text-sm text-gray-400">まだ注釈がありません</p>

        {handleGenerateAnnotationFromDocument && (
          <Button
            className="flex flex-row items-center gap-1"
            onClick={() => handleGenerateAnnotationFromDocument()}
          >
            <PlusIcon width={16} height={16} color="white" />
            <div className="text-sm">ドキュメントから注釈を生成</div>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayAnnotations.map((annotation) => (
        <div
          key={annotation.id}
          className="flex flex-col gap-2 rounded-lg border border-gray-600 bg-slate-800 p-3"
        >
          {/* 注釈ヘッダー */}
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image
                alt=""
                src={annotation.author.image ?? ""}
                height={24}
                width={24}
                className="rounded-full border border-gray-600"
              />
              <span className="text-xs text-gray-400">
                {annotation.author.name}
              </span>
              <RelativeTimeWithTooltip
                datetime={annotation.createdAt}
                className="text-xs text-gray-500"
              />
            </div>
            <div className="flex flex-col items-end gap-1">
              <Link href={`/annotations/${annotation.id}`}>
                <Button
                  size="medium"
                  className="justify-centers flex flex-row items-center bg-gray-700 px-2 text-xs hover:bg-gray-600"
                >
                  詳細
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex w-full flex-row items-center justify-between">
            <span
              className={`flex w-max flex-row items-center justify-center rounded-full px-1 py-0.5 text-xs font-medium ${getAnnotationTypeColor(
                annotation.type,
              )}`}
            >
              {getAnnotationTypeLabel(annotation.type)}
            </span>
            <Button
              size="small"
              onClick={() => {
                setShowAdditionalGraphExtractionModal(true);
                setAnnotationText(
                  `[Node: ${node.name}(${node.label})]\n ${convertJsonToText(annotation.content)}`,
                );
              }}
              className="flex h-6 flex-row items-center justify-center bg-gray-700 px-2 text-xs"
            >
              グラフ抽出
            </Button>
          </div>

          {/* 注釈内容 */}
          <div className="p-2 text-sm text-gray-200">
            <HighlightedText
              text={convertJsonToText(annotation.content)}
              entities={entities}
              maxLength={300}
              showEllipsis={true}
              onEntityClick={(_entityName, entityId) => {
                setFocusedNode(
                  entities.find((entity) => entity.id === entityId),
                );
              }}
            />
          </div>

          <div className="flex flex-col items-end gap-1">
            <Button
              size="small"
              onClick={() => handleReply(annotation.id)}
              className="flex h-6 flex-row items-center justify-center bg-gray-700 px-2 text-xs"
            >
              <ReplyIcon width={16} height={16} color="white" />
              返信
            </Button>
          </div>

          {/* 子注釈 */}
          {annotation.childAnnotations &&
            annotation.childAnnotations.length > 0 && (
              <div className="ml-2 border-l-2 border-gray-600 pl-3">
                <button
                  onClick={() => toggleReplies(annotation.id)}
                  className="mb-2 flex w-full flex-row items-center justify-between gap-2 rounded-md p-2 text-xs text-gray-400 transition-colors hover:bg-slate-700 hover:text-gray-300"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1">
                      {(() => {
                        // 同じユーザーの重複を除去
                        const uniqueAuthors = annotation.childAnnotations
                          .reduce(
                            (acc, child) => {
                              if (
                                !acc.find(
                                  (author) => author.id === child.author.id,
                                )
                              ) {
                                acc.push(child.author);
                              }
                              return acc;
                            },
                            [] as (typeof annotation.childAnnotations)[0]["author"][],
                          )
                          .slice(0, 3);

                        return (
                          <>
                            {uniqueAuthors.map((author, index) => (
                              <Image
                                key={author.id}
                                alt=""
                                src={author.image ?? ""}
                                height={20}
                                width={20}
                                className="rounded-full border border-slate-600"
                                style={{ zIndex: 3 - index }}
                              />
                            ))}
                            {uniqueAuthors.length > 3 && (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-600 text-xs text-white">
                                …
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <span>{annotation.childAnnotations.length}件の返信</span>
                  </div>
                  <span
                    className={`transform transition-transform ${expandedReplies.has(annotation.id) ? "rotate-180" : ""}`}
                  >
                    <ChevronDownIcon width={16} height={16} color="white" />
                  </span>
                </button>
                {expandedReplies.has(annotation.id) && (
                  <div className="space-y-2">
                    {annotation.childAnnotations.slice(0, 3).map((child) => (
                      <div
                        key={child.id}
                        className="mb-2 rounded border border-gray-700 bg-slate-700 p-2"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <Image
                            alt=""
                            src={child.author.image ?? ""}
                            height={16}
                            width={16}
                            className="rounded-full border border-gray-600"
                          />
                          <span className="text-xs text-gray-400">
                            {child.author.name}
                          </span>
                          <RelativeTimeWithTooltip
                            datetime={child.createdAt}
                            className="text-xs text-gray-500"
                          />
                        </div>
                        <div className="text-xs text-gray-300">
                          <HighlightedText
                            text={convertJsonToText(child.content)}
                            entities={entities}
                            maxLength={100}
                            showEllipsis={true}
                            onEntityClick={(_entityName, entityId) => {
                              setFocusedNode(
                                entities.find(
                                  (entity) => entity.id === entityId,
                                ),
                              );
                            }}
                          />
                        </div>
                      </div>
                    ))}

                    {annotation.childAnnotations.length > 3 && (
                      <div className="mt-4">
                        <Link href={`/annotations/${annotation.id}`}>
                          <Button
                            size="small"
                            className="flex-row items-center justify-center bg-gray-700 px-2 text-xs hover:bg-gray-600"
                          >
                            すべての返信を見る ( +{" "}
                            {annotation.childAnnotations.length - 3}
                            件)
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
        </div>
      ))}
      <AnnotationForm
        targetType="annotation"
        targetId={parentAnnotationId ?? ""}
        topicSpaceId={topicSpaceId}
        parentAnnotationId={parentAnnotationId}
        isOpen={showAnnotationForm && !!parentAnnotationId}
        setIsOpen={setShowAnnotationForm}
        onSuccess={() => {
          void onRefetch();
        }}
      />
      {setIsGraphEditor && (
        <AdditionalGraphExtractionModal
          text={annotationText}
          isAdditionalGraphExtractionModalOpen={
            showAdditionalGraphExtractionModal
          }
          setIsAdditionalGraphExtractionModalOpen={
            setShowAdditionalGraphExtractionModal
          }
          setIsGraphEditor={setIsGraphEditor}
          entities={entities}
          onGraphUpdate={onGraphUpdate}
          centralSubject={node}
          topicSpaceId={topicSpaceId}
        />
      )}
    </div>
  );
};
