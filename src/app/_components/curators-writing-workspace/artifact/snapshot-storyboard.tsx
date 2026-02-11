"use client";

import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import {
  Pencil2Icon,
  PlusIcon,
  TrashIcon,
  ResetIcon,
  TriangleDownIcon,
  ListNumberIcon,
  PaperRollIcon,
  FilterIcon,
} from "@/app/_components/icons";
import { useInView } from "react-intersection-observer";
import { useEffect, useState, useRef, useMemo } from "react";
import type {
  GraphDocumentForFrontend,
  FilterCondition,
  LayoutInstruction,
} from "@/app/const/types";
import type { JSONContent } from "@tiptap/react";
import type { PreparedCommunity } from "@/server/api/schemas/knowledge-graph";
import {
  type MetaGraphStoryData,
  getStoryText,
  buildStoryDocFromSegments,
} from "@/app/_hooks/use-meta-graph-story";
import type { FocusedSegmentRef } from "@/app/const/story-segment";
import { Loading } from "../../loading/loading";
import { LinkButton } from "../../button/link-button";
import { SortableList } from "@/app/_components/sortable";
import { SortableItem } from "@/app/_components/sortable/sortable-item";
import { DeleteRecordModal } from "../../modal/delete-record-modal";
import { Textarea } from "../../textarea";
import { FilterSection } from "@/app/_components/layout-edit/sections/filter-section";
import { StoryHistoryModal } from "./story-history-modal";

export const SnapshotStoryboard = ({
  workspaceId,
  metaGraphSummaries,
  narrativeFlow,
  onCommunityFocus,
  onSegmentFocus,
  focusedSegmentRef,
  metaGraphData,
  detailedStories,
  preparedCommunities,
  narrativeActions,
  isRegeneratingTransitions,
  currentContent,
  onContentUpdate,
  referencedTopicSpaceId,
  metaGraphStoryData,
  setIsStorytellingMode,
  onEditModeChange,
  onStoryDelete,
  onApplyStoryFilter,
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
  /** 現在フォーカス中のセグメント（同じセグメントを再クリックで解除するため） */
  focusedSegmentRef?: FocusedSegmentRef | null;
  metaGraphData?: {
    metaNodes: Array<{
      communityId: string;
      memberNodeIds: string[];
      size: number;
    }>;
    metaGraph: GraphDocumentForFrontend;
  } | null;
  detailedStories?: Record<string, string | JSONContent>; // communityId -> story (string or Tiptap JSONContent)
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
  referencedTopicSpaceId?: string;
  metaGraphStoryData?: MetaGraphStoryData | null;
  setIsStorytellingMode: React.Dispatch<React.SetStateAction<boolean>>;
  onEditModeChange?: (isEditMode: boolean) => void;
  onStoryDelete?: () => void;
  /** フィルタ「反映」時にグラフ表示用に親へ渡す */
  onApplyStoryFilter?: (filter: LayoutInstruction["filter"]) => void;
  /** 段落クリックで局所グラフをハイライト（対応する nodeIds/edgeIds を渡す） */
  onSegmentFocus?: (ref: FocusedSegmentRef | null) => void;
}) => {
  // ストーリーデータの取得（refetch用）
  const { refetch: refetchStory } = api.story.get.useQuery(
    { workspaceId },
    {
      enabled: false, // 手動でrefetchするため、自動取得は無効化
    },
  );

  const saveStory = api.story.upsert.useMutation({
    onSuccess: async () => {
      console.log("ストーリーを保存しました。");
      await refetchStory();
    },
    onError: (error) => {
      console.error("ストーリーの保存に失敗しました:", error);
      alert("ストーリーの保存に失敗しました。");
    },
  });

  const annotateStorySegments = api.kg.annotateStorySegments.useMutation();

  const updateWorkspace = api.workspace.update.useMutation({
    onSuccess: () => {
      setIsStorytellingMode(false);

    },
    onError: (error) => {
      console.error("Workspaceの更新に失敗しました:", error);
      alert("ストーリーの追加に失敗しました。");
    },
  });

  const [isAddingStories, setIsAddingStories] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isFilterMode, setIsFilterMode] = useState(false);
  const [isDeleteStoryModalOpen, setIsDeleteStoryModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // フィルタ設定（DB保存用・印刷反映用）
  const [localFilter, setLocalFilter] = useState<
    LayoutInstruction["filter"] | undefined
  >(undefined);
  const [rootFilterCondition, setRootFilterCondition] = useState<
    FilterCondition | undefined
  >(undefined);

  useEffect(() => {
    const filter = metaGraphStoryData?.filter;
    setLocalFilter(filter);
    setRootFilterCondition(filter?.condition);
  }, [metaGraphStoryData?.filter]);

  // セクション編集用の状態管理
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<Record<string, string>>({});
  const [editingDescription, setEditingDescription] = useState<Record<string, string>>({});

  // 編集モードの変更を親に通知
  useEffect(() => {
    onEditModeChange?.(isEditMode);
  }, [isEditMode, onEditModeChange]);

  // ドラッグ終了時のハンドラー
  const handleDragEnd = ({
    oldIndex,
    newIndex,
  }: {
    activeId: string;
    overId: string;
    oldIndex: number;
    newIndex: number;
  }) => {
    if (narrativeActions) {
      narrativeActions.moveNarrativeItem(oldIndex, newIndex);
    }
  };

  const handleAddStoriesToContent = () => {
    if (!narrativeFlow || narrativeFlow.length === 0) {
      alert("ストーリーがありません。");
      return;
    }

    setIsAddingStories(true);

    try {
      // Tiptapの無効なノードをクリーンアップする関数
      const cleanContent = (content: JSONContent[]): JSONContent[] => {
        return content
          .map((node) => {
            // 空のcontent配列を持つparagraphを修正
            if (node.type === "paragraph" && (!node.content || node.content.length === 0)) {
              return {
                ...node,
                content: [{ type: "text", text: " " }],
              };
            }
            // 空のテキストノードを修正
            if (node.content && Array.isArray(node.content)) {
              const cleanedContent = node.content
                .map((child) => {
                  // 空のテキストノードをスペースに変換
                  if (child.type === "text" && (child.text === "" || !child.text)) {
                    return { type: "text", text: " " };
                  }
                  return child;
                })
                .filter((child) => {
                  // 無効なテキストノードを削除
                  return !(child.type === "text" && child.text === undefined);
                });

              // paragraphが空になった場合はスペースを追加
              if (cleanedContent.length === 0 && node.type === "paragraph") {
                return {
                  ...node,
                  content: [{ type: "text", text: " " }],
                };
              }

              return {
                ...node,
                content: cleanedContent,
              };
            }
            return node;
          })
          .filter((node) => {
            // 完全に無効なparagraphノードを削除
            if (node.type === "paragraph" && (!node.content || node.content.length === 0)) {
              return false;
            }
            return true;
          });
      };

      const DEFAULT_DOC: JSONContent = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: " " }],
          },
        ],
      };

      // 既存のcontentをクリーンアップ
      const existingContent = currentContent
        ? {
          ...currentContent,
          content: currentContent.content ? cleanContent(currentContent.content) : [],
        }
        : DEFAULT_DOC;

      // クリーンアップ後も空の場合はDEFAULT_DOCを使用
      if (!existingContent.content || existingContent.content.length === 0) {
        existingContent.content = DEFAULT_DOC.content;
      }

      // ストーリーをTiptapのJSON形式に変換
      const storyContent: JSONContent[] = [];

      // ナラティブフローに従って順番に追加
      const sortedFlow = [...narrativeFlow].sort((a, b) => a.order - b.order);

      sortedFlow.forEach((flow) => {
        const summary = metaGraphSummaries?.find(
          (s) => s.communityId === flow.communityId,
        );
        const rawStory = detailedStories?.[flow.communityId];
        const title = summary?.title ?? `コミュニティ ${flow.communityId}`;
        // detailedStories の要素は string | JSONContent（API 型）。ESLint が index アクセスを error 型と誤検知するため無効化
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const storyText: string =
          rawStory != null
            ? typeof rawStory === "string"
              ? rawStory
              : // eslint-disable-next-line @typescript-eslint/no-unsafe-call
              getStoryText(rawStory)
            : summary?.summary ?? "";

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
          // 空の場合はスペースを持つ段落を追加（Tiptapは空のcontentを許可しない）
          storyContent.push({
            type: "paragraph",
            content: [{ type: "text", text: " " }],
          });
        }

        // ストーリー間の区切りとしてスペースを持つ段落を追加
        storyContent.push({
          type: "paragraph",
          content: [{ type: "text", text: " " }],
        });
      });

      // 既存のcontentにストーリーを追加
      const combinedContent = [
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
                  text: "追加されたストーリー",
                },
              ],
            },
          ]
          : []),
        ...storyContent,
      ];

      // 最終的なcontentをクリーンアップ
      const cleanedCombinedContent = cleanContent(combinedContent);

      // クリーンアップ後も空の場合はDEFAULT_DOCを使用
      const finalContent = cleanedCombinedContent.length > 0
        ? cleanedCombinedContent
        : DEFAULT_DOC.content;

      const newContent = {
        type: "doc" as const,
        content: finalContent,
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

  // ナラティブフローがある場合はそれを使用
  const storyItems = useMemo(
    () =>
      narrativeFlow && narrativeFlow.length > 0
        ? narrativeFlow
          .map((flow) => {
            const summary = metaGraphSummaries?.find(
              (s) => s.communityId === flow.communityId,
            );
            // 詳細ストーリーがあればそれを使用、なければ要約を使用（string | JSONContent の場合は getStoryText で文字列化）
            const rawStory = detailedStories?.[flow.communityId];
            // detailedStories の要素は string | JSONContent。ESLint が index アクセスを error 型と誤検知するため無効化
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const description: string =
              rawStory != null
                ? typeof rawStory === "string"
                  ? rawStory
                  : // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                  getStoryText(rawStory)
                : summary?.summary ?? "";
            return {
              id: flow.communityId,
              title: summary?.title ?? `コミュニティ ${flow.communityId}`,
              description: description || (summary?.summary ?? ""),
              summary: summary?.summary ?? "",
              transitionText: flow.transitionText,
              order: flow.order,
              storyContent: rawStory ?? undefined, // JSONContent のとき段落クリックでハイライトに利用
            };
          })
          .sort((a, b) => a.order - b.order)
        : [],
    [narrativeFlow, metaGraphSummaries, detailedStories],
  );

  // ストーリーを保存（フィルタ設定を含む）
  const handleSaveStory = () => {
    if (!metaGraphStoryData || !referencedTopicSpaceId) {
      alert("ストーリーのデータがないか、リポジトリが設定されていません。");
      return;
    }

    saveStory.mutate({
      workspaceId,
      referencedTopicSpaceId,
      data: {
        ...metaGraphStoryData,
        filter: localFilter,
      },
    });
  };

  const handleUpdateFilter = (updates: Partial<LayoutInstruction["filter"]>) => {
    setLocalFilter((prev) => ({ ...prev, ...updates }));
  };

  const handleApplyFilterConditions = () => {
    const nextFilter: LayoutInstruction["filter"] = {
      ...localFilter,
      condition: rootFilterCondition,
    };
    setLocalFilter(nextFilter);
    onApplyStoryFilter?.(nextFilter);
  };

  // セクションをクリックした時のハンドラー
  const handleSectionClick = (sectionId: string) => {
    // 並べ替えモードの時は無効
    if (isEditMode) {
      return;
    }

    // 既に編集中のセクションがある場合は保存
    if (editingSectionId && editingSectionId !== sectionId) {
      void handleSaveSection(editingSectionId);
    }

    // 新しいセクションを編集モードにする
    const item = storyItems.find((i) => i.id === sectionId);
    if (item) {
      setEditingSectionId(sectionId);
      setEditingTitle((prev) => ({
        ...prev,
        [sectionId]: item.title,
      }));
      setEditingDescription((prev) => ({
        ...prev,
        [sectionId]: item.description,
      }));
    }
  };

  // セクションを保存するハンドラー（編集後は再アノテーションで対応付けを更新）
  const handleSaveSection = async (sectionId: string) => {
    if (!metaGraphStoryData || !referencedTopicSpaceId) {
      alert("ストーリーのデータがないか、リポジトリが設定されていません。");
      return;
    }

    const title = editingTitle[sectionId];
    const description = editingDescription[sectionId] ?? "";

    if (!title) {
      alert("タイトルを入力してください。");
      return;
    }

    let storyValue: string | JSONContent = description;
    const preparedCommunity = preparedCommunities?.find(
      (c) => c.communityId === sectionId,
    );
    if (
      preparedCommunity?.memberNodes?.length &&
      preparedCommunity?.internalEdgesDetailed?.length
    ) {
      try {
        const result = await annotateStorySegments.mutateAsync({
          communityId: sectionId,
          fullText: description,
          memberNodes: preparedCommunity.memberNodes,
          internalEdgesDetailed: preparedCommunity.internalEdgesDetailed,
        });
        if (result.segments.length > 0) {
          // tRPC の mutateAsync 戻り値が error 型と誤検知されるため無効化
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
          storyValue = buildStoryDocFromSegments(result.segments);
        }
      } catch {
        // 再アノテーション失敗時はプレーンテキストのまま保存
      }
    }

    const updatedData = {
      ...metaGraphStoryData,
      summaries: metaGraphStoryData.summaries.map((summary) =>
        summary.communityId === sectionId
          ? { ...summary, title }
          : summary,
      ),
      detailedStories: {
        ...metaGraphStoryData.detailedStories,
        [sectionId]: storyValue,
      },
    };

    saveStory.mutate(
      {
        workspaceId,
        referencedTopicSpaceId,
        data: updatedData,
      },
      {
        onSuccess: () => {
          // 編集状態を解除
          setEditingSectionId(null);
          setEditingTitle((prev) => {
            const newState = { ...prev };
            delete newState[sectionId];
            return newState;
          });
          setEditingDescription((prev) => {
            const newState = { ...prev };
            delete newState[sectionId];
            return newState;
          });
          // 親コンポーネントに更新を通知する必要がある場合はここで処理
          // 現在はuseMetaGraphStoryフックが自動的に再取得するため、特に必要なし
        },
      },
    );
  };

  // 編集をキャンセルするハンドラー
  const handleCancelEdit = () => {
    const currentSectionId = editingSectionId;
    if (currentSectionId) {
      setEditingSectionId(null);
      setEditingTitle((prev) => {
        const newState = { ...prev };
        delete newState[currentSectionId];
        return newState;
      });
      setEditingDescription((prev) => {
        const newState = { ...prev };
        delete newState[currentSectionId];
        return newState;
      });
    }
  };

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
                <ListNumberIcon width={14} height={14} />
                <span>{isEditMode ? "並べ替え終了" : "並べ替え"}</span>
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
              <Button
                size="small"
                onClick={() => setIsFilterMode(!isFilterMode)}
                className={`flex !h-8 !w-8 items-center justify-center !p-0 ${isFilterMode ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-700 hover:bg-slate-600"}`}
              >
                <FilterIcon width={14} height={14} color="white" />
              </Button>
            </>
          )}
        </div>

        {/* 右側：保存、エクスポートと追加ボタン */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="small"
            onClick={() => setIsHistoryModalOpen(true)}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600"
          >
            <span>履歴</span>
          </Button>
          {metaGraphStoryData && referencedTopicSpaceId && (
            <Button
              size="small"
              onClick={handleSaveStory}
              disabled={saveStory.isPending}
              className="flex items-center gap-2"
            >
              {saveStory.isPending ? (
                <>
                  <Loading size={14} color="white" />
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <Pencil2Icon width={14} height={14} color="white" />
                  <span>保存</span>
                </>
              )}
            </Button>
          )}
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
                <Loading size={14} color="white" />
                <span>追加中...</span>
              </>
            ) : (
              <>
                <Pencil2Icon width={14} height={14} color="white" />
                <span>エディタに追加</span>
              </>
            )}
          </Button>
          <LinkButton
            target="_blank"
            size="small"
            href={`/workspaces/${workspaceId}/print-preview`}
            className="texts-sm flex items-center gap-2"
          >
            <PaperRollIcon width={14} height={14} />
            <span>出力</span>
          </LinkButton>
          {metaGraphStoryData && (
            <Button
              size="small"
              onClick={() => setIsDeleteStoryModalOpen(true)}
              className="flex items-center gap-2 !text-error-red"
            >
              <TrashIcon width={14} height={14} color="#ea1c0c" />
            </Button>
          )}
        </div>
      </div>

      <DeleteRecordModal
        isOpen={isDeleteStoryModalOpen}
        setIsOpen={setIsDeleteStoryModalOpen}
        type="story"
        id={workspaceId}
        refetch={() => {
          onStoryDelete?.();
        }}
      />

      {isHistoryModalOpen && (
        <StoryHistoryModal
          workspaceId={workspaceId}
          onClose={() => setIsHistoryModalOpen(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto pr-2">
        {isFilterMode ? (
          <div className="py-4">
            <FilterSection
              filter={localFilter ?? {}}
              rootCondition={rootFilterCondition}
              onRootConditionChange={setRootFilterCondition}
              onUpdateFilter={handleUpdateFilter}
              onApplyConditions={handleApplyFilterConditions}
              showCenterNodesSettings={false}
            />
          </div>
        ) : (
          <>
            <SortableList
              items={storyItems}
              onDragEnd={handleDragEnd}
              disabled={!isEditMode}
              className="space-y-8 pb-20 pt-2"
              emptyMessage={
                <div className="py-12 text-center text-slate-500">
                  {metaGraphSummaries && metaGraphSummaries.length === 0
                    ? "メタグラフを生成中..."
                    : "ストーリーがありません。メタグラフを生成してください。"}
                </div>
              }
            >
              {(item, index) => (
                <SortableItem
                  id={item.id}
                  disabled={!isEditMode}
                  className={isEditMode ? "cursor-grab active:cursor-grabbing" : ""}
                >
                  <StorySection
                    item={item}
                    storyContent={"storyContent" in item ? item.storyContent : undefined}
                    onSegmentFocus={onSegmentFocus}
                    focusedSegmentRef={focusedSegmentRef}
                    onInView={() => {
                      if (onCommunityFocus) {
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
                    isEditing={editingSectionId === item.id}
                    onSectionClick={() => handleSectionClick(item.id)}
                    onSave={() => handleSaveSection(item.id)}
                    onCancel={handleCancelEdit}
                    editingTitle={editingTitle[item.id] ?? item.title}
                    editingDescription={editingDescription[item.id] ?? item.description}
                    onTitleChange={(title) =>
                      setEditingTitle((prev) => ({ ...prev, [item.id]: title }))
                    }
                    onDescriptionChange={(description) =>
                      setEditingDescription((prev) => ({
                        ...prev,
                        [item.id]: description,
                      }))
                    }
                  />
                </SortableItem>
              )}
            </SortableList>

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
          </>
        )}
      </div>
    </div>
  );
};

// ストーリーセクションコンポーネント（スクロール検知用）
/** 2つの FocusedSegmentRef が同じセグメントを指すか */
function isSameSegmentRef(
  a: FocusedSegmentRef | null | undefined,
  b: { communityId: string; nodeIds: string[]; edgeIds?: string[] },
): boolean {
  if (!a) return false;
  if (a.communityId !== b.communityId) return false;
  const sortJoin = (arr: string[]) => [...arr].sort().join(",");
  if (sortJoin(a.nodeIds ?? []) !== sortJoin(b.nodeIds ?? [])) return false;
  if (sortJoin(a.edgeIds ?? []) !== sortJoin(b.edgeIds ?? [])) return false;
  return true;
}

const StorySection = ({
  item,
  onInView,
  storyContent,
  onSegmentFocus,
  focusedSegmentRef,
  metaGraphData,
  hasDetailedStory,
  isEditMode,
  onMoveUp,
  onMoveDown,
  onRemove,
  isFirst,
  isLast,
  isEditing,
  onSectionClick,
  onSave,
  onCancel,
  editingTitle,
  editingDescription,
  onTitleChange,
  onDescriptionChange,
}: {
  item: {
    id: string;
    title: string;
    description: string;
    summary?: string;
    transitionText?: string;
    order: number;
  };
  storyContent?: string | JSONContent;
  onSegmentFocus?: (ref: FocusedSegmentRef | null) => void;
  focusedSegmentRef?: FocusedSegmentRef | null;
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
  isEditing?: boolean;
  onSectionClick?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  editingTitle?: string;
  editingDescription?: string;
  onTitleChange?: (title: string) => void;
  onDescriptionChange?: (description: string) => void;
}) => {
  // useInViewでスクロール検知
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
        opacity: inView ?? isEditMode ?? isEditing ? 1 : 0.6,
        transform: inView ?? isEditMode ?? isEditing ? "scale(1)" : "scale(0.98)",
      }}
    >
      {/* 編集コントロール（並べ替えモード時） */}
      {isEditMode && (
        <div
          className="absolute -right-1 -top-1 z-10 flex gap-1 rounded-lg bg-slate-900 p-1 shadow-lg ring-1 ring-slate-700"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          >
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
          </div>
          <div
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          >
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
          </div>
          <div
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          >
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
        </div>
      )}

      {/* 編集ボタン（並べ替えモードでない時、かつ編集モードでない時） */}
      {!isEditMode && !isEditing && (
        <div
          className="absolute right-1 top-1 z-10"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Button
            size="small"
            onClick={() => {
              onSectionClick?.();
            }}
            className="flex !h-8 !w-8 items-center justify-center !p-0 bg-slate-700 hover:bg-slate-600"
          >
            <Pencil2Icon width={14} height={14} />
          </Button>
        </div>
      )}

      {/* 保存・キャンセルボタン（編集モード時） */}
      {isEditing && !isEditMode && (
        <div
          className="absolute -right-1 -top-1 z-10 flex gap-1 rounded-lg bg-slate-900 p-1 shadow-lg ring-1 ring-slate-700"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          >
            <Button
              size="small"
              onClick={() => {
                onCancel?.();
              }}
              className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600"
            >
              <span>キャンセル</span>
            </Button>
          </div>
          <div
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          >
            <Button
              size="small"
              onClick={() => {
                onSave?.();
              }}
              className="flex items-center gap-1"
            >
              <span>保存</span>
            </Button>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 pt-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 font-bold text-white">
          {item.order}
        </div>
      </div>
      <div className="flex-1">
        {isEditing && !isEditMode ? (
          <>
            <input
              type="text"
              value={editingTitle ?? item.title}
              onChange={(e) => onTitleChange?.(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="mb-2 w-full rounded bg-slate-700 px-2 py-1 text-lg font-semibold text-white outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="タイトル"
            />
            {hasDetailedStory && (
              <div className="mb-2 inline-block rounded-md bg-blue-900/20 px-2 py-1 text-xs text-blue-300">
                詳細ストーリー
              </div>
            )}
            <Textarea
              value={editingDescription ?? item.description}
              onChange={(e) => onDescriptionChange?.(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="mb-2 w-full rounded bg-slate-700 px-2 py-2 text-slate-300 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="詳細ストーリー"
            // rows={8}
            />
          </>
        ) : (
          <>
            <h3 className="mb-2 text-lg font-semibold text-white">{item.title}</h3>
            {hasDetailedStory && (
              <div className="mb-2 inline-block rounded-md bg-blue-900/20 px-2 py-1 text-xs text-blue-300">
                詳細ストーリー
              </div>
            )}
            {typeof storyContent === "object" &&
              storyContent?.content &&
              Array.isArray(storyContent.content) ? (
              <div className={`mb-2 space-y-2 text-slate-300 ${isEditMode ? "line-clamp-3 overflow-hidden text-ellipsis" : ""}`}>
                {storyContent.content.map((node, idx) => {
                  if (node.type !== "paragraph" || !node.content) return null;
                  const text = (node.content as Array<{ type?: string; text?: string }>)
                    .map((c) => (c.type === "text" ? c.text ?? "" : ""))
                    .join("");
                  const attrs = (node.attrs ?? {}) as {
                    segmentNodeIds?: string[];
                    segmentEdgeIds?: string[];
                  };
                  const hasRef = (attrs.segmentNodeIds?.length ?? 0) > 0;
                  const segmentRef = {
                    communityId: item.id,
                    nodeIds: attrs.segmentNodeIds ?? [],
                    edgeIds: attrs.segmentEdgeIds ?? [],
                  };
                  const isFocused = hasRef && isSameSegmentRef(focusedSegmentRef, segmentRef);
                  return (
                    <div
                      key={idx}
                      role={hasRef ? "button" : undefined}
                      tabIndex={hasRef ? 0 : undefined}
                      onClick={
                        hasRef && onSegmentFocus
                          ? () => {
                            if (isFocused) {
                              onSegmentFocus(null);
                            } else {
                              onSegmentFocus(segmentRef);
                            }
                          }
                          : undefined
                      }
                      onKeyDown={
                        hasRef && onSegmentFocus
                          ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (isFocused) {
                                onSegmentFocus(null);
                              } else {
                                onSegmentFocus(segmentRef);
                              }
                            }
                          }
                          : undefined
                      }
                      className={
                        hasRef
                          ? `cursor-pointer rounded px-1 py-0.5 hover:bg-slate-700/50 focus:bg-slate-700/50 focus:outline-none ${isFocused ? "bg-slate-700/50" : ""}`
                          : ""
                      }
                    >
                      {text}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className={`mb-2 whitespace-pre-line text-slate-300 ${isEditMode ? "line-clamp-1 overflow-hidden text-ellipsis" : ""}`}
                title={isEditMode ? item.description : undefined}
              >
                {item.description}
              </div>
            )}
          </>
        )}
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
