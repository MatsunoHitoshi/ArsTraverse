"use client";

import { useParams, useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { useState, useEffect } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { Button } from "@/app/_components/button/button";
import { PrintPreviewContent } from "@/app/_components/print-preview/print-preview-content";
import { LayoutSettingsPanel } from "@/app/_components/print-preview/layout-settings-panel";
import type { PrintLayoutSettings } from "@/app/_components/print-preview/types";
import { Loading } from "@/app/_components/loading/loading";

export default function PrintPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  // ワークスペースデータを取得
  const {
    data: workspaceData,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
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
      id: topicSpaceId ?? "",
    },
    {
      enabled: !!topicSpaceId,
    },
  );

  // ストーリーデータを取得
  const { data: storyData, isLoading: isLoadingStory } = api.story.get.useQuery(
    { workspaceId },
    {
      enabled: !!workspaceId,
    },
  );

  const [graphData, setGraphData] = useState<GraphDocumentForFrontend | null>(
    null,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [reSimulationTrigger, setReSimulationTrigger] = useState(0);
  const [layoutSettings, setLayoutSettings] = useState<PrintLayoutSettings>({
    pageSize: {
      mode: "template",
      template: "A0",
      customWidth: 2000,
      customHeight: 1116,
      unit: "mm",
      orientation: "landscape",
    },
    margins: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    fontSize: {
      workspaceTitle: 21,
      sectionTitle: 14,
      body: 7,
      node: 12,
      edge: 6,
    },
    graphSize: {
      width: 800,
      height: 600,
      autoFit: true,
    },
    colorMode: "color",
    metaGraphDisplay: "none",
    layoutOrientation: "vertical",
    workspaceTitleDisplay: "none",
    showEdgeLabels: true,
  });

  useEffect(() => {
    if (topicSpace?.graphData) {
      setGraphData(topicSpace.graphData as GraphDocumentForFrontend);
    }
  }, [topicSpace]);

  // 保存済みストーリーデータを使用
  const metaGraphData = storyData?.metaGraphData;

  if (isLoadingWorkspace || isLoadingStory) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center text-center text-white">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
          <div>読み込み中...</div>
        </div>
      </div>
    );
  }

  if (workspaceError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <h1 className="mb-4 text-2xl font-bold">エラー</h1>
          <p className="text-red-400">{workspaceError.message}</p>
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

  if (!metaGraphData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <h1 className="mb-4 text-2xl font-bold">ストーリーがありません</h1>
          <p className="text-gray-400">
            ストーリーが生成されていません。ワークスペースでストーリーを作成してください。
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
      <div className="flex h-screen w-full flex-col items-center justify-center pt-14">
        <div className="flex h-full w-full flex-col bg-slate-900">
          {/* Main Content */}
          <div className="relative flex flex-1 overflow-hidden">
            {/* Settings Panel */}
            {isSettingsOpen && (
              <div className="w-80 overflow-y-auto">
                <LayoutSettingsPanel
                  settings={layoutSettings}
                  onSettingsChange={setLayoutSettings}
                  onReSimulation={() => {
                    setLayoutSettings((prev) => ({ ...prev, nodePositions: {} }));
                    setReSimulationTrigger((t) => t + 1);
                  }}
                />
              </div>
            )}

            {/* Preview Area */}
            {!!graphData ? (
              <div className="flex-1 flex w-full overflow-auto bg-[#f5f5f5] p-4">
                <PrintPreviewContent
                  metaGraphData={metaGraphData}
                  originalGraphData={graphData}
                  layoutSettings={layoutSettings}
                  reSimulationTrigger={reSimulationTrigger}
                  workspaceId={workspaceId}
                  workspaceTitle={workspaceData?.name}
                  onWorkspaceTitlePositionChange={(pos) =>
                    setLayoutSettings((prev) => ({
                      ...prev,
                      workspaceTitlePosition: pos,
                    }))
                  }
                  onWorkspaceTitleSizeChange={(size) =>
                    setLayoutSettings((prev) => ({
                      ...prev,
                      workspaceTitleSize: size,
                    }))
                  }
                  onSectionSizeChange={(communityId, size) =>
                    setLayoutSettings((prev) => {
                      const toRecord = (v: unknown): Record<string, { width: number; height: number }> =>
                        v != null && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, { width: number; height: number }>) } : {};
                      const current = toRecord(prev.sectionSizes);
                      const w = typeof size.width === "number" ? size.width : 400;
                      const h = typeof size.height === "number" ? size.height : 300;
                      return {
                        ...prev,
                        sectionSizes: { ...current, [communityId]: { width: w, height: h } },
                      };
                    })
                  }
                  onCommunityPositionChange={(communityId, pos) =>
                    setLayoutSettings((prev) => {
                      const toRecord = (v: unknown): Record<string, { x: number; y: number }> =>
                        v != null && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, { x: number; y: number }>) } : {};
                      const current = toRecord(prev.communityPositions);
                      return {
                        ...prev,
                        communityPositions: { ...current, [communityId]: pos },
                      };
                    })
                  }
                  onNodePositionChange={(nodeId, pos) =>
                    setLayoutSettings((prev) => {
                      const toRecord = (v: unknown): Record<string, { x: number; y: number }> =>
                        v != null && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, { x: number; y: number }>) } : {};
                      const current = toRecord(prev.nodePositions);
                      return {
                        ...prev,
                        nodePositions: { ...current, [nodeId]: pos },
                      };
                    })
                  }
                />
              </div>
            ) : (
              <div className="flex-1 flex w-full items-center justify-center overflow-y-auto bg-slate-800">
                <div className="text-center text-white">
                  <h1 className="mb-4 text-2xl font-bold">グラフを取得中</h1>
                  <Loading size={40} color="white" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
