import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/trpc/react";
import type {
  GraphDocumentForFrontend,
  LayoutInstruction,
} from "@/app/const/types";
import type { Workspace } from "@prisma/client";
import {
  CuratorialContextSchema,
  type PreparedCommunity,
} from "@/server/api/schemas/knowledge-graph";
import type { JSONContent } from "@tiptap/react";
import type { StorySegment } from "@/app/const/story-segment";

export interface MetaGraphStoryData {
  metaGraph: GraphDocumentForFrontend;
  metaNodes: Array<{
    communityId: string;
    memberNodeIds: string[];
    size: number;
    hasExternalConnections: boolean;
  }>;
  communityMap: Record<string, string>;
  summaries: Array<{
    communityId: string;
    title: string;
    summary: string;
  }>;
  narrativeFlow: Array<{
    communityId: string;
    order: number;
    transitionText: string;
  }>;
  detailedStories: Record<string, string | JSONContent>; // communityId -> story (string or Tiptap doc with segment attrs)
  preparedCommunities: PreparedCommunity[];
  filter?: LayoutInstruction["filter"]; // グラフフィルタリング設定
}

/** segments から Tiptap doc（段落に segmentNodeIds/segmentEdgeIds/segmentSource 付き）を組み立てる */
export function buildStoryDocFromSegments(
  segments: StorySegment[],
): JSONContent {
  const content = segments.map((seg) => ({
    type: "paragraph" as const,
    attrs: {
      ...(seg.nodeIds?.length ? { segmentNodeIds: seg.nodeIds } : {}),
      ...(seg.edgeIds?.length ? { segmentEdgeIds: seg.edgeIds } : {}),
      ...(seg.source ? { segmentSource: seg.source } : {}),
    },
    content: [{ type: "text" as const, text: seg.text }],
  }));
  return { type: "doc", content };
}

/** detailedStories[communityId]（string | JSONContent）からプレーンテキストを取得 */
export function getStoryText(value: string | JSONContent | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const content = value.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((node) => {
      if (node.type === "paragraph" && node.content) {
        return (node.content as Array<{ type?: string; text?: string }>)
          .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
          .join("");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export function useMetaGraphStory(
  graphDocument: GraphDocumentForFrontend | null,
  filteredGraphData: GraphDocumentForFrontend | null,
  workspace: Workspace | null | undefined,
  isMetaGraphMode: boolean,
) {
  const [metaGraphData, setMetaGraphData] = useState<MetaGraphStoryData | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegeneratingTransitions, setIsRegeneratingTransitions] =
    useState(false);

  const generateMetaGraph = api.kg.generateMetaGraph.useMutation();
  const summarizeCommunities = api.kg.summarizeCommunities.useMutation();
  const generateCommunityStory = api.kg.generateCommunityStory.useMutation();
  const regenerateNarrativeFlow = api.kg.regenerateNarrativeFlow.useMutation();

  // 構造変更時の自動トランジション再生成用: debounce と重複防止
  const autoRegenerateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingSnapshotRef = useRef<MetaGraphStoryData | null>(null);
  const isRegeneratingTransitionsRef = useRef(false);

  const AUTO_REGENERATE_DEBOUNCE_MS = 400;

  // トランジションのみ再生成（本文は触らない）。snapshot の order で API を呼び、narrativeFlow だけ更新する。
  const runAutoRegenerateTransitionsOnly = useCallback(
    (snapshot: MetaGraphStoryData) => {
      if (!workspace) return;

      const validIds = new Set(
        snapshot.preparedCommunities.map((c) => c.communityId),
      );
      const orderedCommunityIds = [...snapshot.narrativeFlow]
        .sort((a, b) => a.order - b.order)
        .map((n) => n.communityId)
        .filter((id) => validIds.has(id));

      if (orderedCommunityIds.length === 0) return;
      if (isRegeneratingTransitionsRef.current) return;

      isRegeneratingTransitionsRef.current = true;
      setIsRegeneratingTransitions(true);

      const parseResult =
        workspace.curatorialContext &&
        typeof workspace.curatorialContext === "object" &&
        !Array.isArray(workspace.curatorialContext)
          ? CuratorialContextSchema.safeParse(workspace.curatorialContext)
          : null;
      const parsedCuratorialContext =
        parseResult?.success ? parseResult.data : null;

      regenerateNarrativeFlow.mutate(
        {
          orderedCommunityIds,
          communities: snapshot.preparedCommunities,
          curatorialContext: parsedCuratorialContext ?? undefined,
        },
        {
          onSuccess: (result) => {
            setMetaGraphData((prev) =>
              prev ? { ...prev, narrativeFlow: result.narrativeFlow } : prev,
            );
          },
          onSettled: () => {
            isRegeneratingTransitionsRef.current = false;
            setIsRegeneratingTransitions(false);
          },
        },
      );
    },
    [workspace, regenerateNarrativeFlow],
  );

  // 構造変更後に呼ぶ。debounce してからトランジションのみ再生成する。
  const scheduleAutoRegenerateTransitions = useCallback(
    (snapshot: MetaGraphStoryData) => {
      pendingSnapshotRef.current = snapshot;

      if (autoRegenerateDebounceRef.current != null) {
        clearTimeout(autoRegenerateDebounceRef.current);
      }

      autoRegenerateDebounceRef.current = setTimeout(() => {
        autoRegenerateDebounceRef.current = null;
        const target = pendingSnapshotRef.current;
        if (target) runAutoRegenerateTransitionsOnly(target);
      }, AUTO_REGENERATE_DEBOUNCE_MS);
    },
    [runAutoRegenerateTransitionsOnly],
  );

  useEffect(() => {
    return () => {
      if (autoRegenerateDebounceRef.current != null) {
        clearTimeout(autoRegenerateDebounceRef.current);
      }
    };
  }, []);

  // 保存済みStoryデータを取得
  const { data: savedStoryData, isLoading: isLoadingStory } =
    api.story.get.useQuery(
      { workspaceId: workspace?.id ?? "" },
      {
        enabled: !!workspace?.id && isMetaGraphMode,
      },
    );

  // 保存済みStoryデータを読み込む（初回ロード時や savedStoryData の更新時のみ同期）
  // 注意: metaGraphData を依存に含めないこと。含めるとローカルで並び替えするたびに
  // エフェクトが走り「current !== saved」でサーバー側の古い順序で上書きされてしまう。
  useEffect(() => {
    if (
      !isMetaGraphMode ||
      !workspace ||
      isLoadingStory ||
      !savedStoryData?.metaGraphData
    ) {
      return;
    }

    setMetaGraphData((prev) => {
      const savedDataString = JSON.stringify(savedStoryData.metaGraphData);
      const currentDataString = JSON.stringify(prev);
      if (currentDataString === savedDataString) return prev;
      return savedStoryData.metaGraphData;
    });
  }, [
    isMetaGraphMode,
    workspace,
    isLoadingStory,
    savedStoryData?.metaGraphData,
  ]);

  // メタグラフ生成と要約生成
  useEffect(() => {
    // まず、保存済みデータの読み込みが完了するまで待つ
    if (isLoadingStory) {
      return;
    }

    // 保存済みデータがある場合は生成をスキップ
    if (savedStoryData?.metaGraphData) {
      return;
    }

    // その他の条件チェック
    if (
      !isMetaGraphMode ||
      !graphDocument ||
      !workspace ||
      metaGraphData !== null ||
      isGenerating ||
      generateMetaGraph.isPending ||
      summarizeCommunities.isPending
    ) {
      return;
    }

    const targetGraph = filteredGraphData ?? graphDocument;

    setIsGenerating(true);

    // 1. メタグラフを生成
    generateMetaGraph.mutate(
      {
        graphDocument: targetGraph,
        minCommunitySize: 3,
      },
      {
        onSuccess: (metaGraphResult) => {
          if (
            !metaGraphResult.preparedCommunities ||
            metaGraphResult.preparedCommunities.length === 0
          ) {
            setIsGenerating(false);
            return;
          }

          // 2. コミュニティの要約を生成
          // curatorialContextを安全にパース
          const parseResult =
            workspace.curatorialContext &&
            typeof workspace.curatorialContext === "object" &&
            !Array.isArray(workspace.curatorialContext)
              ? CuratorialContextSchema.safeParse(workspace.curatorialContext)
              : null;
          const parsedCuratorialContext = parseResult?.success
            ? parseResult.data
            : null;

          summarizeCommunities.mutate(
            {
              communities: metaGraphResult.preparedCommunities,
              curatorialContext: parsedCuratorialContext,
            },
            {
              onSuccess: (summaryResult) => {
                // メタグラフのノードにタイトルを設定
                const updatedMetaGraph = {
                  ...metaGraphResult.metaGraph,
                  nodes: metaGraphResult.metaGraph.nodes.map((node) => {
                    const summary = summaryResult.summaries.find(
                      (s) => s.communityId === node.id,
                    );
                    return {
                      ...node,
                      name: summary?.title ?? node.name,
                    };
                  }),
                };

                // 3. 各コミュニティの詳細ストーリーを並列生成
                const sortedFlow = summaryResult.narrativeFlow.sort(
                  (a, b) => a.order - b.order,
                );

                // 初期状態を設定
                setMetaGraphData({
                  metaGraph: updatedMetaGraph,
                  metaNodes: metaGraphResult.metaNodes,
                  communityMap: metaGraphResult.communityMap,
                  summaries: summaryResult.summaries,
                  narrativeFlow: summaryResult.narrativeFlow,
                  detailedStories: {},
                  preparedCommunities: metaGraphResult.preparedCommunities,
                });

                // 各コミュニティのストーリー生成を並列実行
                const storyPromises = sortedFlow.map((flow) => {
                  const community = metaGraphResult.preparedCommunities.find(
                    (c) => c.communityId === flow.communityId,
                  );

                  if (!community) {
                    // コミュニティが見つからない場合は空の結果を返す
                    return Promise.resolve({
                      communityId: flow.communityId,
                      story: null,
                      success: false,
                    });
                  }

                  // 型安全に詳細情報を取得
                  const communityWithDetails = community as typeof community & {
                    memberNodes?: Array<{
                      id: string;
                      name: string;
                      label: string;
                      properties: Record<string, unknown>;
                    }>;
                    internalEdgesDetailed?: Array<{
                      sourceId: string;
                      sourceName: string;
                      targetId: string;
                      targetName: string;
                      type: string;
                      properties: Record<string, unknown>;
                    }>;
                  };

                  // mutateAsync を使用して Promise を取得
                  return generateCommunityStory
                    .mutateAsync({
                      communityId: flow.communityId,
                      // 後方互換性のため残す
                      memberNodeNames: community.memberNodeNames,
                      memberNodeLabels: community.memberNodeLabels,
                      internalEdges: community.internalEdges,
                      externalConnections: community.externalConnections,
                      // 詳細情報（新規）
                      memberNodes: communityWithDetails.memberNodes,
                      internalEdgesDetailed:
                        communityWithDetails.internalEdgesDetailed,
                      curatorialContext: parsedCuratorialContext,
                      workspaceId: workspace?.id,
                    })
                    .then((storyResult) => {
                      // 成功時に即座に状態を更新（segments があれば Tiptap doc、なければ story 文字列）
                      setMetaGraphData((prev) => {
                        if (!prev) return prev;
                        const value =
                          storyResult.segments?.length > 0
                            ? buildStoryDocFromSegments(storyResult.segments)
                            : storyResult.story;
                        return {
                          ...prev,
                          detailedStories: {
                            ...prev.detailedStories,
                            [storyResult.communityId]: value,
                          },
                        };
                      });
                      return {
                        communityId: storyResult.communityId,
                        story: storyResult.story,
                        success: true,
                      };
                    })
                    .catch((error) => {
                      console.error(
                        `コミュニティ ${flow.communityId} のストーリー生成に失敗しました:`,
                        error,
                      );
                      return {
                        communityId: flow.communityId,
                        story: null,
                        success: false,
                      };
                    });
                });

                // すべてのストーリー生成を並列実行
                Promise.allSettled(storyPromises)
                  .then((results) => {
                    // すべての処理が完了したことを確認
                    const successCount = results.filter(
                      (r) => r.status === "fulfilled" && r.value.success,
                    ).length;
                    const failureCount = results.length - successCount;

                    if (failureCount > 0) {
                      console.warn(
                        `${failureCount}個のコミュニティのストーリー生成に失敗しました。`,
                      );
                    }

                    setIsGenerating(false);
                  })
                  .catch((error) => {
                    console.error(
                      "ストーリー生成中に予期しないエラーが発生しました:",
                      error,
                    );
                    setIsGenerating(false);
                  });
              },
              onError: () => {
                setIsGenerating(false);
              },
            },
          );
        },
        onError: () => {
          setIsGenerating(false);
        },
      },
    );
  }, [
    isMetaGraphMode,
    graphDocument,
    filteredGraphData,
    metaGraphData,
    isGenerating,
    workspace,
    generateMetaGraph,
    summarizeCommunities,
    generateCommunityStory,
    isLoadingStory,
    savedStoryData?.metaGraphData,
  ]);

  // メタグラフモードが無効化されたらデータをクリア
  useEffect(() => {
    if (!isMetaGraphMode) {
      setMetaGraphData(null);
      setIsGenerating(false);
    }
  }, [isMetaGraphMode]);

  // ストーリーにコミュニティを追加
  const addToNarrative = useCallback(
    (communityId: string) => {
      setMetaGraphData((prev) => {
        if (!prev) return prev;
        const currentMaxOrder = Math.max(
          0,
          ...prev.narrativeFlow.map((n) => n.order),
        );
        const next = {
          ...prev,
          narrativeFlow: [
            ...prev.narrativeFlow,
            {
              communityId,
              order: currentMaxOrder + 1,
              transitionText: "(トランジションを再生成してください)",
            },
          ],
        };
        scheduleAutoRegenerateTransitions(next);
        return next;
      });
    },
    [scheduleAutoRegenerateTransitions],
  );

  // ストーリーからコミュニティを削除
  const removeFromNarrative = useCallback(
    (communityId: string) => {
      setMetaGraphData((prev) => {
        if (!prev) return prev;
        const newFlow = prev.narrativeFlow
          .filter((n) => n.communityId !== communityId)
          .map((n, idx) => ({ ...n, order: idx + 1 })); // 順序を再割り当て
        const next = { ...prev, narrativeFlow: newFlow };
        scheduleAutoRegenerateTransitions(next);
        return next;
      });
    },
    [scheduleAutoRegenerateTransitions],
  );

  // ストーリーの順序を入れ替え
  const moveNarrativeItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      setMetaGraphData((prev) => {
        if (!prev) return prev;
        const newFlow = [...prev.narrativeFlow].sort(
          (a, b) => a.order - b.order,
        );
        const [movedItem] = newFlow.splice(fromIndex, 1);
        if (!movedItem) return prev;
        newFlow.splice(toIndex, 0, movedItem);

        // 順序を再割り当て
        const reorderedFlow = newFlow.map((n, idx) => ({
          ...n,
          order: idx + 1,
        }));

        const next = { ...prev, narrativeFlow: reorderedFlow };
        scheduleAutoRegenerateTransitions(next);
        return next;
      });
    },
    [scheduleAutoRegenerateTransitions],
  );

  // トランジションテキストを再生成
  const regenerateTransitions = useCallback(() => {
    if (!metaGraphData || !workspace) return;

    const validCommunityIds = new Set(
      metaGraphData.preparedCommunities.map((c) => c.communityId),
    );

    // narrativeFlow のうち preparedCommunities に存在する ID だけを使う
    // （保存データと現在のメタグラフがずれていると ID が一致しないため）
    const orderedCommunityIds = [...metaGraphData.narrativeFlow]
      .sort((a, b) => a.order - b.order)
      .map((n) => n.communityId)
      .filter((id) => validCommunityIds.has(id));

    if (orderedCommunityIds.length === 0) {
      console.warn(
        "regenerateTransitions: narrativeFlow に preparedCommunities と一致する ID がありません。ストーリーを追加し直すか、メタグラフを再生成してください。",
      );
      return;
    }

    setIsRegeneratingTransitions(true);

    // curatorialContextを安全にパース
    const parseResult =
      workspace.curatorialContext &&
      typeof workspace.curatorialContext === "object" &&
      !Array.isArray(workspace.curatorialContext)
        ? CuratorialContextSchema.safeParse(workspace.curatorialContext)
        : null;
    const parsedCuratorialContext = parseResult?.success
      ? parseResult.data
      : null;

    regenerateNarrativeFlow.mutate(
      {
        orderedCommunityIds,
        communities: metaGraphData.preparedCommunities,
        curatorialContext: parsedCuratorialContext,
      },
      {
        onSuccess: (result) => {
          // 1. まずナラティブフロー（トランジション）を更新
          setMetaGraphData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              narrativeFlow: result.narrativeFlow,
            };
          });

          // 2. 続いて各コミュニティの詳細ストーリーを再生成（前後のコミュニティ情報を渡して繋がりを意識）
          // isRegeneratingTransitions は true のまま維持（UIでローディング表示するため）

          const sortedFlow = [...result.narrativeFlow].sort(
            (a, b) => a.order - b.order,
          );

          const storyPromises = sortedFlow.map((flow, index) => {
            const community = metaGraphData.preparedCommunities.find(
              (c) => c.communityId === flow.communityId,
            );

            if (!community) return Promise.resolve(null);

            const prevFlow = sortedFlow[index - 1];
            const nextFlow = sortedFlow[index + 1];
            const prevSummary = prevFlow
              ? metaGraphData.summaries.find(
                  (s) => s.communityId === prevFlow.communityId,
                )
              : undefined;
            const nextSummary = nextFlow
              ? metaGraphData.summaries.find(
                  (s) => s.communityId === nextFlow.communityId,
                )
              : undefined;

            const narrativeContext =
              prevFlow ?? nextFlow
                ? {
                    previousTitle: prevSummary?.title,
                    previousSummary: prevSummary?.summary,
                    nextTitle: nextSummary?.title,
                    nextSummary: nextSummary?.summary,
                    transitionTextBefore: flow.transitionText?.trim() ?? undefined,
                    transitionTextAfter: nextFlow?.transitionText?.trim() ?? undefined,
                  }
                : undefined;

            // 型安全に詳細情報を取得
            const communityWithDetails = community as typeof community & {
              memberNodes?: Array<{
                id: string;
                name: string;
                label: string;
                properties: Record<string, unknown>;
              }>;
              internalEdgesDetailed?: Array<{
                sourceId: string;
                sourceName: string;
                targetId: string;
                targetName: string;
                type: string;
                properties: Record<string, unknown>;
              }>;
            };

            return generateCommunityStory
              .mutateAsync({
                communityId: flow.communityId,
                memberNodeNames: community.memberNodeNames,
                memberNodeLabels: community.memberNodeLabels,
                internalEdges: community.internalEdges,
                externalConnections: community.externalConnections,
                memberNodes: communityWithDetails.memberNodes,
                internalEdgesDetailed:
                  communityWithDetails.internalEdgesDetailed,
                curatorialContext: parsedCuratorialContext,
                narrativeContext,
              })
              .then((storyResult) => {
                setMetaGraphData((prev) => {
                  if (!prev) return prev;
                  const value =
                    storyResult.segments?.length > 0
                      ? buildStoryDocFromSegments(storyResult.segments)
                      : storyResult.story;
                  return {
                    ...prev,
                    detailedStories: {
                      ...prev.detailedStories,
                      [storyResult.communityId]: value,
                    },
                  };
                });
              })
              .catch((error) => {
                console.error(
                  `コミュニティ ${flow.communityId} のストーリー再生成に失敗しました:`,
                  error,
                );
              });
          });

          void Promise.allSettled(storyPromises).then(() => {
            setIsRegeneratingTransitions(false);
          });
        },
        onError: (error) => {
          console.error("トランジションの再生成に失敗しました:", error);
          setIsRegeneratingTransitions(false);
        },
      },
    );
  }, [
    metaGraphData,
    workspace,
    regenerateNarrativeFlow,
    generateCommunityStory,
  ]);

  return {
    metaGraphData,
    isLoading:
      isGenerating ||
      generateMetaGraph.isPending ||
      summarizeCommunities.isPending ||
      isLoadingStory,
    isGeneratingStories:
      Object.keys(metaGraphData?.detailedStories ?? {}).length <
      (metaGraphData?.narrativeFlow.length ?? 0),
    isRegeneratingTransitions,
    consistency: savedStoryData?.consistency,
    actions: {
      addToNarrative,
      removeFromNarrative,
      moveNarrativeItem,
      regenerateTransitions,
    },
  };
}
