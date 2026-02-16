"use client";

// 印刷出力用のページ


import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { useEffect, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { PrintPreviewContent } from "@/app/_components/print-preview/print-preview-content";
import type { PrintLayoutSettings } from "@/app/_components/print-preview/types";

export default function PrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;

  // クエリパラメータからlayoutSettingsを取得
  const [layoutSettings, setLayoutSettings] = useState<PrintLayoutSettings | null>(null);

  useEffect(() => {
    const settingsParam = searchParams.get("settings");
    if (settingsParam) {
      try {
        const decoded = decodeURIComponent(settingsParam);
        const parsed = JSON.parse(decoded) as PrintLayoutSettings;
        setLayoutSettings(parsed);
      } catch (error) {
        console.error("Failed to parse layout settings:", error);
      }
    }
  }, [searchParams]);

  // ワークスペースデータを取得
  const {
    data: workspaceData,
    isLoading: isLoadingWorkspace,
  } = api.workspace.getById.useQuery(
    { id: workspaceId },
    {
      enabled: !!workspaceId,
    },
  );

  const topicSpaceId = workspaceData?.referencedTopicSpaces[0]?.id;

  // TopicSpaceのグラフデータを取得
  const { data: topicSpace } = api.topicSpaces.getById.useQuery(
    {
      id: topicSpaceId ?? "",
      withDocumentGraph: true,
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

  useEffect(() => {
    if (topicSpace?.graphData) {
      setGraphData(topicSpace.graphData as GraphDocumentForFrontend);
    }
  }, [topicSpace]);

  // 保存済みストーリーデータを使用
  const metaGraphData = storyData?.metaGraphData;

  // デフォルトのlayoutSettings
  const defaultLayoutSettings: PrintLayoutSettings = {
    pageSize: {
      mode: "template",
      template: "A0",
      customWidth: 1116,
      customHeight: 2500,
      unit: "mm",
      orientation: "portrait",
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
  };

  const finalLayoutSettings = layoutSettings ?? defaultLayoutSettings;

  if (isLoadingWorkspace || isLoadingStory || !layoutSettings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
          <div>読み込み中...</div>
        </div>
      </div>
    );
  }

  if (!workspaceData || !topicSpaceId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">エラー</h1>
          <p className="text-red-400">
            ワークスペースまたはトピックスペースが見つかりません
          </p>
        </div>
      </div>
    );
  }

  if (!graphData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">グラフがありません</h1>
          <p className="text-gray-400">
            このトピックスペースにはまだグラフが作成されていません
          </p>
        </div>
      </div>
    );
  }

  if (!metaGraphData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">ストーリーがありません</h1>
          <p className="text-gray-400">
            ストーリーが生成されていません。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PrintPreviewContent
        metaGraphData={metaGraphData}
        originalGraphData={graphData}
        layoutSettings={finalLayoutSettings}
      />
    </div>
  );
}
