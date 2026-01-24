import { useState, useEffect, useCallback } from "react";
import { api } from "@/trpc/react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { Workspace } from "@prisma/client";
import {
  CuratorialContextSchema,
  type PreparedCommunity,
} from "@/server/api/schemas/knowledge-graph";

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
  detailedStories: Record<string, string>; // communityId -> story
  preparedCommunities: PreparedCommunity[];
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

  // 保存済みStoryデータを取得
  const { data: savedStoryData, isLoading: isLoadingStory } =
    api.story.get.useQuery(
      { workspaceId: workspace?.id ?? "" },
      {
        enabled: !!(workspace?.id) && isMetaGraphMode,
      },
    );

  // 保存済みStoryデータを読み込む
  useEffect(() => {
    if (
      !isMetaGraphMode ||
      !workspace ||
      isLoadingStory ||
      !savedStoryData?.metaGraphData
    ) {
      return;
    }

    // 保存済みデータが存在し、現在のmetaGraphDataと異なる場合に更新
    // JSON.stringifyで比較して、実際に変更があった場合のみ更新
    const currentDataString = JSON.stringify(metaGraphData);
    const savedDataString = JSON.stringify(savedStoryData.metaGraphData);
    
    if (currentDataString !== savedDataString) {
      setMetaGraphData(savedStoryData.metaGraphData);
    }
  }, [
    isMetaGraphMode,
    workspace,
    isLoadingStory,
    savedStoryData?.metaGraphData,
    metaGraphData,
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
                      // 成功時に即座に状態を更新（関数型更新で安全にマージ）
                      setMetaGraphData((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          detailedStories: {
                            ...prev.detailedStories,
                            [storyResult.communityId]: storyResult.story,
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
  const addToNarrative = useCallback((communityId: string) => {
    setMetaGraphData((prev) => {
      if (!prev) return prev;
      const currentMaxOrder = Math.max(
        0,
        ...prev.narrativeFlow.map((n) => n.order),
      );
      return {
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
    });
  }, []);

  // ストーリーからコミュニティを削除
  const removeFromNarrative = useCallback((communityId: string) => {
    setMetaGraphData((prev) => {
      if (!prev) return prev;
      const newFlow = prev.narrativeFlow
        .filter((n) => n.communityId !== communityId)
        .map((n, idx) => ({ ...n, order: idx + 1 })); // 順序を再割り当て
      return {
        ...prev,
        narrativeFlow: newFlow,
      };
    });
  }, []);

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

        return {
          ...prev,
          narrativeFlow: reorderedFlow,
        };
      });
    },
    [],
  );

  // トランジションテキストを再生成
  const regenerateTransitions = useCallback(() => {
    if (!metaGraphData || !workspace) return;

    setIsRegeneratingTransitions(true);

    const orderedCommunityIds = metaGraphData.narrativeFlow
      .sort((a, b) => a.order - b.order)
      .map((n) => n.communityId);

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

          // 2. 続いて各コミュニティの詳細ストーリーを再生成
          // isRegeneratingTransitions は true のまま維持（UIでローディング表示するため）

          const storyPromises = result.narrativeFlow.map((flow) => {
            const community = metaGraphData.preparedCommunities.find(
              (c) => c.communityId === flow.communityId,
            );

            if (!community) return Promise.resolve(null);

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
              })
              .then((storyResult) => {
                setMetaGraphData((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    detailedStories: {
                      ...prev.detailedStories,
                      [storyResult.communityId]: storyResult.story,
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
