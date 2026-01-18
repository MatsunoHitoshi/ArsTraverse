"use client";

import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import {
  FileTextIcon,
  Pencil2Icon,
  PlusIcon,
  TrashIcon,
  ResetIcon,
  TriangleDownIcon,
} from "@/app/_components/icons";
import { useInView } from "react-intersection-observer";
import { useEffect, useState, useRef, useMemo } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { JSONContent } from "@tiptap/react";
import type { PreparedCommunity } from "@/server/api/schemas/knowledge-graph";

export const SnapshotStoryboard = ({
  workspaceId,
  metaGraphSummaries,
  narrativeFlow,
  onCommunityFocus,
  metaGraphData,
  detailedStories,
  preparedCommunities,
  narrativeActions,
  isRegeneratingTransitions,
  currentContent,
  onContentUpdate,
}: {
  workspaceId: string;
  metaGraphSummaries?: Array<{
    communityId: string;
    title: string;
    summary: string;
  }>;
  narrativeFlow?: Array<{
    communityId: string;
    order: number;
    transitionText: string;
  }>;
  onCommunityFocus?: (communityId: string | null) => void;
  metaGraphData?: {
    metaNodes: Array<{
      communityId: string;
      memberNodeIds: string[];
      size: number;
    }>;
    metaGraph: GraphDocumentForFrontend;
  } | null;
  detailedStories?: Record<string, string>; // communityId -> story
  preparedCommunities?: PreparedCommunity[];
  narrativeActions?: {
    addToNarrative: (communityId: string) => void;
    removeFromNarrative: (communityId: string) => void;
    moveNarrativeItem: (fromIndex: number, toIndex: number) => void;
    regenerateTransitions: () => void;
  };
  isRegeneratingTransitions?: boolean;
  currentContent?: JSONContent | null;
  onContentUpdate?: (content: JSONContent) => void;
}) => {
  const { data: snapshots } = api.snapshot.list.useQuery({
    workspaceId,
  });

  const updateWorkspace = api.workspace.update.useMutation({
    onSuccess: () => {
      alert("ストーリーをWorkspaceのcontentに追加しました。");
    },
    onError: (error) => {
      console.error("Workspaceの更新に失敗しました:", error);
      alert("ストーリーの追加に失敗しました。");
    },
  });

  const [isAddingStories, setIsAddingStories] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const handleExport = () => {
    alert(
      "この機能は現在開発中です。\nSVG/PDFエクスポート機能が実装される予定です。",
    );
  };

  const handleAddStoriesToContent = () => {
    if (!narrativeFlow || narrativeFlow.length === 0) {
      alert("ストーリーがありません。");
      return;
    }

    setIsAddingStories(true);

    try {
      // 現在のcontentを取得（既存のcontentがある場合はそれを使用）
      const existingContent = currentContent ?? {
        type: "doc",
        content: [],
      };

      // ストーリーをTiptapのJSON形式に変換
      const storyContent: JSONContent[] = [];

      // ナラティブフローに従って順番に追加
      const sortedFlow = [...narrativeFlow].sort((a, b) => a.order - b.order);

      sortedFlow.forEach((flow) => {
        const summary = metaGraphSummaries?.find(
          (s) => s.communityId === flow.communityId,
        );
        const detailedStory = detailedStories?.[flow.communityId];
        const title = summary?.title ?? `コミュニティ ${flow.communityId}`;
        const storyText = detailedStory ?? summary?.summary ?? "";

        // 見出し2を追加
        storyContent.push({
          type: "heading",
          attrs: { level: 2 },
          content: [
            {
              type: "text",
              text: title,
            },
          ],
        });

        // 段落を追加（ストーリーテキストを行ごとに分割）
        const paragraphs = storyText.split("\n").filter((p) => p.trim() !== "");
        if (paragraphs.length > 0) {
          paragraphs.forEach((paragraph) => {
            storyContent.push({
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: paragraph.trim(),
                },
              ],
            });
          });
        } else {
          // 空の場合は空の段落を追加
          storyContent.push({
            type: "paragraph",
            content: [],
          });
        }

        // 遷移テキストがある場合は追加
        if (flow.transitionText) {
          storyContent.push({
            type: "paragraph",
            attrs: { class: "italic text-slate-400" },
            content: [
              {
                type: "text",
                text: flow.transitionText,
              },
            ],
          });
        }
      });

      // 既存のcontentにストーリーを追加
      const newContent = {
        type: "doc" as const,
        content: [
          ...(existingContent.content ?? []),
          // 区切り線を追加（既存のcontentがある場合）
          ...(existingContent.content && existingContent.content.length > 0
            ? [
                {
                  type: "horizontalRule" as const,
                },
                {
                  type: "heading" as const,
                  attrs: { level: 1 },
                  content: [
                    {
                      type: "text" as const,
                      text: "コミュニティストーリー",
                    },
                  ],
                },
              ]
            : []),
          ...storyContent,
        ],
      };

      // Workspaceを更新
      updateWorkspace.mutate({
        id: workspaceId,
        content: newContent,
      });

      // コールバックがあれば呼び出し
      if (onContentUpdate) {
        onContentUpdate(newContent);
      }
    } catch (error) {
      console.error("ストーリーの追加中にエラーが発生しました:", error);
      alert("ストーリーの追加中にエラーが発生しました。");
    } finally {
      setIsAddingStories(false);
    }
  };

  // ナラティブフローがある場合はそれを使用、なければスナップショットを使用
  const storyItems = useMemo(
    () =>
      narrativeFlow && narrativeFlow.length > 0
        ? narrativeFlow
            .map((flow) => {
              const summary = metaGraphSummaries?.find(
                (s) => s.communityId === flow.communityId,
              );
              // 詳細ストーリーがあればそれを使用、なければ要約を使用
              const detailedStory = detailedStories?.[flow.communityId];
              return {
                id: flow.communityId,
                title: summary?.title ?? `コミュニティ ${flow.communityId}`,
                description: detailedStory ?? summary?.summary ?? "",
                summary: summary?.summary ?? "", // 要約も保持（将来の拡張用）
                transitionText: flow.transitionText,
                order: flow.order,
              };
            })
            .sort((a, b) => a.order - b.order)
        : (snapshots?.map((snapshot, index) => ({
            id: snapshot.id,
            title: snapshot.name,
            description: snapshot.description ?? "No description",
            transitionText: undefined,
            order: index + 1,
          })) ?? []),
    [narrativeFlow, metaGraphSummaries, detailedStories, snapshots],
  );

  // 利用可能なコミュニティ（ストーリーに含まれていないもの）
  const availableCommunities = useMemo(() => {
    if (!preparedCommunities || !narrativeFlow) return [];
    const narrativeIds = new Set(narrativeFlow.map((n) => n.communityId));
    return preparedCommunities.filter((c) => !narrativeIds.has(c.communityId));
  }, [preparedCommunities, narrativeFlow]);

  // 初期表示時に最初のアイテムをフォーカス
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (
      !hasInitialized.current &&
      storyItems.length > 0 &&
      narrativeFlow &&
      narrativeFlow.length > 0 &&
      onCommunityFocus
    ) {
      hasInitialized.current = true;
      const firstItem = storyItems[0];
      if (firstItem) {
        onCommunityFocus(firstItem.id);
      }
    }
  }, [storyItems, narrativeFlow, onCommunityFocus]);

  return (
    <div className="flex h-full flex-col bg-slate-900 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        {/* 左側：編集モード切り替えと再生成ボタン */}
        <div className="flex flex-wrap items-center gap-2">
          {narrativeActions && (
            <>
              <Button
                size="small"
                onClick={() => setIsEditMode(!isEditMode)}
                className={`flex items-center gap-2 ${isEditMode ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-700 hover:bg-slate-600"}`}
              >
                <Pencil2Icon width={14} height={14} />
                <span>{isEditMode ? "編集終了" : "編集"}</span>
              </Button>
              {isEditMode && (
                <Button
                  size="small"
                  onClick={() => narrativeActions.regenerateTransitions()}
                  disabled={isRegeneratingTransitions}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  <ResetIcon width={14} height={14} />
                  <span>
                    {isRegeneratingTransitions
                      ? "再生成中..."
                      : "ストーリーを再生成"}
                  </span>
                </Button>
              )}
            </>
          )}
        </div>

        {/* 右側：エクスポートと追加ボタン */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            onClick={handleAddStoriesToContent}
            disabled={
              isAddingStories || !narrativeFlow || narrativeFlow.length === 0
            }
            className="flex items-center gap-2"
          >
            {isAddingStories ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>追加中...</span>
              </>
            ) : (
              <>
                <span>📝</span>
                <span>エディタに追加</span>
              </>
            )}
          </Button>
          <Button
            size="small"
            onClick={handleExport}
            className="flex items-center gap-2"
          >
            <FileTextIcon width={14} height={14} />
            <span>PDF</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        <div className="space-y-8 pb-20 pt-2">
          {storyItems.map((item, index) => (
            <StorySection
              key={item.id}
              item={item}
              onInView={() => {
                if (onCommunityFocus) {
                  // narrativeFlowが存在する場合はcommunityIdを、そうでない場合はnullを渡す
                  if (narrativeFlow && narrativeFlow.length > 0) {
                    onCommunityFocus(item.id);
                  } else {
                    onCommunityFocus(null);
                  }
                }
              }}
              metaGraphData={metaGraphData}
              hasDetailedStory={!!detailedStories?.[item.id]}
              isEditMode={isEditMode}
              onMoveUp={() =>
                narrativeActions?.moveNarrativeItem(index, index - 1)
              }
              onMoveDown={() =>
                narrativeActions?.moveNarrativeItem(index, index + 1)
              }
              onRemove={() => narrativeActions?.removeFromNarrative(item.id)}
              isFirst={index === 0}
              isLast={index === storyItems.length - 1}
            />
          ))}
          {storyItems.length === 0 && (
            <div className="py-12 text-center text-slate-500">
              {metaGraphSummaries && metaGraphSummaries.length === 0
                ? "メタグラフを生成中..."
                : "ストーリーがありません。メタグラフを生成してください。"}
            </div>
          )}

          {/* 編集モード時の利用可能なコミュニティ一覧 */}
          {isEditMode && availableCommunities.length > 0 && (
            <div className="mt-8 border-t border-slate-700 pt-8">
              <h3 className="mb-4 text-lg font-bold text-white">
                利用可能なコミュニティ
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {availableCommunities.map((community) => {
                  const summary = metaGraphSummaries?.find(
                    (s) => s.communityId === community.communityId,
                  );
                  const title =
                    summary?.title ?? `コミュニティ ${community.communityId}`;

                  return (
                    <div
                      key={community.communityId}
                      className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 p-4 transition-colors hover:border-slate-600"
                    >
                      <div>
                        <div className="font-semibold text-white">{title}</div>
                        <div className="text-xs text-slate-400">
                          {community.memberNodeNames.length} nodes
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {community.memberNodeNames.slice(0, 3).join(", ")}...
                        </div>
                      </div>
                      <Button
                        size="small"
                        onClick={() =>
                          narrativeActions?.addToNarrative(
                            community.communityId,
                          )
                        }
                        className="flex items-center gap-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40"
                      >
                        <PlusIcon width={14} height={14} />
                        追加
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ストーリーセクションコンポーネント（スクロール検知用）
const StorySection = ({
  item,
  onInView,
  metaGraphData,
  hasDetailedStory,
  isEditMode,
  onMoveUp,
  onMoveDown,
  onRemove,
  isFirst,
  isLast,
}: {
  item: {
    id: string;
    title: string;
    description: string;
    summary?: string;
    transitionText?: string;
    order: number;
  };
  onInView: () => void;
  metaGraphData?: {
    metaNodes: Array<{
      communityId: string;
      memberNodeIds: string[];
      size: number;
    }>;
    metaGraph: GraphDocumentForFrontend;
  } | null;
  hasDetailedStory?: boolean;
  isEditMode?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) => {
  const { ref, inView } = useInView({
    rootMargin: "-10% 0px -10% 0px", // 画面中央10%の範囲に入ったら検知（より敏感に）
    threshold: 0.3, // より低い閾値で検知
    triggerOnce: false, // 複数回トリガー可能にする
  });

  useEffect(() => {
    if (inView) {
      onInView();
    }
  }, [inView, onInView, item.id]);

  const metaNode = metaGraphData?.metaNodes.find(
    (n) => n.communityId === item.id,
  );

  return (
    <div
      ref={ref}
      className={`group relative flex gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4 transition-all duration-300 ${isEditMode ? "border-dashed" : ""}`}
      style={{
        opacity: inView || isEditMode ? 1 : 0.6,
        transform: inView || isEditMode ? "scale(1)" : "scale(0.98)",
      }}
    >
      {/* 編集コントロール */}
      {isEditMode && (
        <div className="absolute -right-1 -top-1 z-10 flex gap-1 rounded-lg bg-slate-900 p-1 shadow-lg ring-1 ring-slate-700">
          <Button
            size="small"
            onClick={() => {
              onMoveUp?.();
            }}
            disabled={isFirst}
            className="flex !h-6 !w-6 items-center justify-center !p-0 disabled:opacity-30"
          >
            <div className="rotate-180 transform">
              <TriangleDownIcon width={12} height={12} />
            </div>
          </Button>
          <Button
            size="small"
            onClick={() => {
              onMoveDown?.();
            }}
            disabled={isLast}
            className="flex !h-6 !w-6 items-center justify-center !p-0 disabled:opacity-30"
          >
            <TriangleDownIcon width={12} height={12} />
          </Button>
          <Button
            size="small"
            onClick={() => {
              onRemove?.();
            }}
            className="flex !h-6 !w-6 items-center justify-center bg-red-500/20 !p-0 text-red-400 hover:bg-red-500/40"
          >
            <TrashIcon width={12} height={12} />
          </Button>
        </div>
      )}

      <div className="flex-shrink-0 pt-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 font-bold text-white">
          {item.order}
        </div>
      </div>
      <div className="flex-1">
        <h3 className="mb-2 text-lg font-semibold text-white">{item.title}</h3>
        {hasDetailedStory && (
          <div className="mb-2 inline-block rounded-md bg-blue-900/20 px-2 py-1 text-xs text-blue-300">
            詳細ストーリー
          </div>
        )}
        <div
          className={`mb-2 whitespace-pre-line text-slate-300 ${isEditMode ? "line-clamp-1 overflow-hidden text-ellipsis" : ""}`}
          title={isEditMode ? item.description : undefined}
        >
          {item.description}
        </div>
        {item.transitionText && (
          <p className="mb-4 text-sm italic text-slate-400">
            {item.transitionText}
          </p>
        )}
        {metaNode && (
          <div className="mb-4 text-xs text-slate-500">
            {metaNode.size}個のノードを含むコミュニティ
          </div>
        )}
      </div>
    </div>
  );
};
