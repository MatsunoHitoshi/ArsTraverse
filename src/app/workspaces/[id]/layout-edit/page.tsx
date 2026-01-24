"use client";

import { useParams, useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { GenerativeLayoutGraph } from "@/app/_components/d3/force/generative-layout-graph";
import { useState, useEffect } from "react";
import type {
  GraphDocumentForFrontend,
  LayoutInstruction,
  CuratorialContext,
  CustomNodeType,
} from "@/app/const/types";
import { Button } from "@/app/_components/button/button";
import { ChevronLeftIcon, CrossLargeIcon, PinLeftIcon, PinRightIcon, TriangleDownIcon } from "@/app/_components/icons";
import { Toolbar } from "@/app/_components/toolbar/toolbar";
import { CopilotChat } from "@/app/_components/curators-writing-workspace/copilot/copilot-chat";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import { LayoutInstructionEditor } from "@/app/_components/layout-edit/layout-instruction-editor";
import { NodeInfoPanel } from "@/app/_components/layout-edit/node-info-panel";
import { useMetaGraphStory } from "@/app/_hooks/use-meta-graph-story";
import { SnapshotStoryboard } from "@/app/_components/curators-writing-workspace/artifact/snapshot-storyboard";
import { StackIcon } from "@/app/_components/icons";
import { Loading } from "@/app/_components/loading/loading";

export default function LayoutEditPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  // ワークスペースデータを取得
  const {
    data: workspaceData,
    isLoading,
    error,
  } = api.workspace.getById.useQuery(
    { id: workspaceId },
    {
      enabled: !!workspaceId,
    },
  );

  const topicSpaceId = workspaceData?.referencedTopicSpaces[0]?.id;

  // TopicSpaceのグラフデータを取得
  const { data: topicSpace } = api.topicSpaces.getByIdPublic.useQuery(
    {
      id: topicSpaceId ?? ""
    },
    {
      enabled: !!topicSpaceId,
    },
  );

  const [graphData, setGraphData] = useState<GraphDocumentForFrontend | null>(
    null,
  );
  const [isLinkFiltered, setIsLinkFiltered] = useState<boolean>(false);
  const [nodeSearchQuery, setNodeSearchQuery] = useState<string>("");
  const [layoutInstruction, setLayoutInstruction] =
    useState<LayoutInstruction | null>(null);
  const [filteredGraphData, setFilteredGraphData] =
    useState<GraphDocumentForFrontend | null>(null);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(true);
  const [selectedNode, setSelectedNode] = useState<CustomNodeType | null>(null);
  const [isLayoutEditorOpen, setIsLayoutEditorOpen] = useState<boolean>(false);
  const [isStorytellingMode, setIsStorytellingMode] = useState<boolean>(false);
  const [isStoryEditMode, setIsStoryEditMode] = useState<boolean>(false);
  const [isMetaGraphMode, setIsMetaGraphMode] = useState<boolean>(false);
  const [focusedCommunityId, setFocusedCommunityId] = useState<string | null>(
    null,
  );
  const [isParamsDetailOpen, setIsParamsDetailOpen] = useState<boolean>(false);
  const [layoutOrientation, setLayoutOrientation] = useState<"vertical" | "horizontal">("vertical");

  // ウィンドウサイズを取得してグラフのサイズを計算
  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth =
    (isSidePanelOpen ?? selectedNode ?? isStorytellingMode)
      ? (innerWidth ?? 100) * 0.67 - 4
      : (innerWidth ?? 100) - 4;
  const graphAreaHeight = (innerHeight ?? 300) - 111;

  useEffect(() => {
    if (topicSpace?.graphData) {
      setGraphData(topicSpace.graphData as GraphDocumentForFrontend);
    }
  }, [topicSpace]);

  // メタグラフストーリー生成用のカスタムフック
  // workspaceDataが存在する場合のみ使用（早期リターンでチェック済み）
  const metaGraphStory = useMetaGraphStory(
    graphData,
    filteredGraphData,
    workspaceData ?? null,
    isMetaGraphMode,
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center text-center text-white">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
          <div>読み込み中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <h1 className="mb-4 text-2xl font-bold">エラー</h1>
          <p className="text-red-400">{error.message}</p>
          <Button
            onClick={() => router.push(`/workspaces/${workspaceId}`)}
            className="mt-4"
          >
            ワークスペースに戻る
          </Button>
        </div>
      </div>
    );
  }

  if (!workspaceData || !topicSpaceId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <h1 className="mb-4 text-2xl font-bold">エラー</h1>
          <p className="text-red-400">
            ワークスペースまたはリポジトリが見つかりません
          </p>
          <Button
            onClick={() => router.push(`/workspaces/${workspaceId}`)}
            className="mt-4"
          >
            ワークスペースに戻る
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="z-0 flex min-h-screen flex-col items-center justify-center bg-slate-900">
      <div className="flex h-screen w-full flex-col items-center justify-center pt-12">
        <div className="flex h-full w-full flex-col bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-700 px-4 py-1 text-slate-200">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => router.push(`/workspaces/${workspaceId}`)}
                size="small"
                className="flex items-center gap-2"
              >
                <ChevronLeftIcon height={16} width={16} />
              </Button>
              <h1 className="text-base font-semibold ">
                {workspaceData.name} - レイアウト編集
              </h1>
            </div>
            <div className="flex items-center gap-2 text-slate-200">
              <Toolbar
                isLinkFiltered={isLinkFiltered}
                setIsLinkFiltered={setIsLinkFiltered}
                setNodeSearchQuery={setNodeSearchQuery}
              />
              <Button
                size="small"
                onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
                className={`flex items-center gap-2 ${isSidePanelOpen ? "bg-blue-600" : ""
                  }`}
              >
                {isSidePanelOpen ? <PinRightIcon height={16} width={16} /> : <PinLeftIcon height={16} width={16} />}
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <div className="relative flex flex-1 overflow-hidden">
            {/* Graph Editor */}
            <div
              className={`flex-1 overflow-hidden transition-all ${(isSidePanelOpen ?? selectedNode ?? isStorytellingMode)
                ? "w-7/12"
                : "w-full"
                }`}
            >
              {graphData && (
                <GenerativeLayoutGraph
                  width={graphAreaWidth}
                  height={graphAreaHeight}
                  graphDocument={graphData}
                  filteredGraphDocument={
                    (isMetaGraphMode || isStorytellingMode) &&
                      metaGraphStory.metaGraphData
                      ? metaGraphStory.metaGraphData.metaGraph
                      : (filteredGraphData ?? undefined)
                  }
                  layoutInstruction={layoutInstruction}
                  isLinkFiltered={isLinkFiltered}
                  nodeSearchQuery={nodeSearchQuery}
                  onNodeClick={(node) => setSelectedNode(node)}
                  viewMode={
                    isMetaGraphMode || isStorytellingMode ? "meta" : "detailed"
                  }
                  metaNodeData={
                    metaGraphStory.metaGraphData?.summaries.map((s) => {
                      const narrativeFlowItem =
                        metaGraphStory.metaGraphData?.narrativeFlow.find(
                          (f) => f.communityId === s.communityId,
                        );
                      return {
                        communityId: s.communityId,
                        title: s.title,
                        summary: s.summary,
                        order: narrativeFlowItem?.order,
                      };
                    }) ?? []
                  }
                  focusedCommunityId={focusedCommunityId}
                  communityMap={
                    isMetaGraphMode || isStorytellingMode
                      ? metaGraphStory.metaGraphData?.communityMap
                      : undefined
                  }
                  originalGraphDocument={
                    isMetaGraphMode || isStorytellingMode
                      ? graphData
                      : undefined
                  }
                  layoutOrientation={layoutOrientation}
                  isEditMode={isStoryEditMode}
                />
              )}

              {/* レイアウト指示エディタオーバーレイ */}
              <div
                className={`absolute bottom-0 left-0 right-0 z-10 transition-transform duration-300 ${isLayoutEditorOpen ? "translate-y-0" : "translate-y-full"
                  }
                ${(isSidePanelOpen ?? selectedNode ?? isStorytellingMode) ? "w-7/12" : "w-full"}
                `}
              >
                <LayoutInstructionEditor
                  layoutInstruction={layoutInstruction}
                  onUpdate={(instruction) => {
                    setLayoutInstruction(instruction);
                  }}
                  setIsLayoutEditorOpen={setIsLayoutEditorOpen}
                  isLayoutEditorOpen={isLayoutEditorOpen}
                />
              </div>

              {/* レイアウト指示エディタを開くボタン（閉じている時のみ表示） */}
              {!isLayoutEditorOpen && (
                <div
                  className={`absolute bottom-4 left-0 z-10 ${(isSidePanelOpen ?? selectedNode ?? isStorytellingMode) ? "w-7/12" : "w-full"}`}
                >
                  <div className="flex w-full justify-end px-4">
                    <Button
                      size="small"
                      onClick={() => setIsLayoutEditorOpen(true)}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700"
                    >
                      手動編集
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel: Copilot, Node Info, or Storytelling */}
            {(isSidePanelOpen ?? selectedNode ?? isStorytellingMode) && (
              <div className="flex w-5/12 flex-col border-l border-slate-700">
                <div className="flex w-full flex-row items-center gap-2 p-2">
                  <Button
                    size="small"
                    onClick={() => {
                      setIsStorytellingMode(!isStorytellingMode);
                      if (!isStorytellingMode) {
                        setIsMetaGraphMode(true);
                      }
                    }}
                    disabled={metaGraphStory.isLoading}
                    className={`flex items-center gap-1 ${isStorytellingMode ? "font-bold !text-purple-600" : ""}`}
                  >
                    <StackIcon
                      height={16}
                      width={16}
                      color={isStorytellingMode ? "#9333ea" : "white"}
                    />
                    {isMetaGraphMode ? "ビュー切替" : "ストーリーテリングモード"}
                  </Button>

                  {graphData && isMetaGraphMode && (
                    <Button
                      size="small"
                      onClick={() => {
                        if (isMetaGraphMode) {
                          setIsStorytellingMode(false);
                        }
                        setIsMetaGraphMode(!isMetaGraphMode)
                      }
                      }
                      className={`flex items-center gap-2 ${isMetaGraphMode ? "!text-red-600" : ""}`}
                      disabled={metaGraphStory.isLoading}
                    >
                      {metaGraphStory.isLoading ? <Loading size={14} color="white" /> : (
                        <CrossLargeIcon
                          height={14}
                          width={14}
                          color="red"
                        />
                      )}
                      {metaGraphStory.isLoading ? "生成中..." : "モード終了"}
                    </Button>
                  )}
                </div>
                {isStorytellingMode ? (
                  <SnapshotStoryboard
                    workspaceId={workspaceId}
                    metaGraphSummaries={metaGraphStory.metaGraphData?.summaries}
                    narrativeFlow={metaGraphStory.metaGraphData?.narrativeFlow}
                    detailedStories={
                      metaGraphStory.metaGraphData?.detailedStories
                    }
                    preparedCommunities={
                      metaGraphStory.metaGraphData?.preparedCommunities
                    }
                    narrativeActions={metaGraphStory.actions}
                    isRegeneratingTransitions={
                      metaGraphStory.isRegeneratingTransitions
                    }
                    onCommunityFocus={(communityId) => {
                      setFocusedCommunityId(communityId);
                    }}
                    metaGraphData={
                      metaGraphStory.metaGraphData
                        ? {
                          metaNodes: metaGraphStory.metaGraphData.metaNodes,
                          metaGraph: metaGraphStory.metaGraphData.metaGraph,
                        }
                        : undefined
                    }
                    referencedTopicSpaceId={topicSpaceId}
                    metaGraphStoryData={metaGraphStory.metaGraphData}
                    setIsStorytellingMode={setIsStorytellingMode}
                    onEditModeChange={setIsStoryEditMode}
                  />
                ) : isSidePanelOpen ? (
                  <>
                    {/* 上半分: ノード情報パネル */}
                    <div className="h-1/3 border-b border-slate-700">
                      <NodeInfoPanel
                        node={selectedNode}
                        onClose={() => setSelectedNode(null)}
                      />
                    </div>
                    {/* 中間: パラメータ詳細 */}
                    <div className="border-b border-slate-700">
                      <button
                        onClick={() =>
                          setIsParamsDetailOpen(!isParamsDetailOpen)
                        }
                        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-800/50"
                      >
                        <h3 className="text-sm font-semibold text-slate-300">
                          パラメータ詳細
                        </h3>
                        <div
                          className={`text-slate-400 transition-transform duration-200 ${isParamsDetailOpen ? "rotate-180" : ""
                            }`}
                        >
                          <TriangleDownIcon width={12} height={12} />
                        </div>
                      </button>
                      {isParamsDetailOpen && (
                        <div className="max-h-[calc(33vh-60px)] overflow-y-auto border-t border-slate-700">
                          <div className="p-4">
                            <pre className="rounded bg-slate-800 p-2 text-xs text-slate-300">
                              {JSON.stringify(layoutInstruction, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* 下半分: Copilot Chat */}
                    <div className="h-4/6">
                      <CopilotChat
                        workspaceId={workspaceId}
                        currentGraphData={graphData}
                        curatorialContext={
                          workspaceData.curatorialContext as
                          | CuratorialContext
                          | undefined
                        }
                        currentLayoutInstruction={layoutInstruction}
                        onLayoutInstruction={(instruction) => {
                          console.log(
                            "Layout instruction received:",
                            instruction,
                          );
                          setLayoutInstruction(instruction);
                        }}
                        onFilteredGraphData={(filteredGraph) => {
                          setFilteredGraphData(filteredGraph);
                        }}
                        className="h-full w-full"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {/* Node Info Panel */}
                    <div className="h-1/2 border-b border-slate-700">
                      <NodeInfoPanel
                        node={selectedNode}
                        onClose={() => setSelectedNode(null)}
                      />
                    </div>
                    {/* パラメータ詳細 */}
                    <div className="flex flex-1 flex-col overflow-hidden">
                      <button
                        onClick={() =>
                          setIsParamsDetailOpen(!isParamsDetailOpen)
                        }
                        className="flex items-center justify-between border-b border-slate-700 p-4 text-left transition-colors hover:bg-slate-800/50"
                      >
                        <h3 className="text-sm font-semibold text-slate-300">
                          パラメータ詳細
                        </h3>
                        <div
                          className={`text-slate-400 transition-transform duration-200 ${isParamsDetailOpen ? "rotate-180" : ""
                            }`}
                        >
                          <TriangleDownIcon width={12} height={12} />
                        </div>
                      </button>
                      {isParamsDetailOpen && (
                        <div className="flex-1 overflow-y-auto">
                          <div className="p-4">
                            <pre className="rounded bg-slate-800 p-2 text-xs text-slate-300">
                              {JSON.stringify(layoutInstruction, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
