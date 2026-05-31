"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  type MetaGraphStoryData,
  getStoryText,
} from "@/app/_hooks/use-meta-graph-story";
import type { JSONContent } from "@tiptap/react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { PrintLayoutSettings } from "./types";
import { PrintUnifiedGraphView } from "./print-unified-graph-view";
import { PdfExportButton } from "./pdf-export-button";
import { convertUnit, PAGE_SIZE_TEMPLATES } from "./types";
import { filterGraphByLayoutInstruction } from "@/app/_utils/kg/filter-graph-by-layout-instruction";
import { getSegmentNodeIdsFromMetaGraphStoryData } from "@/app/_utils/story-scroll-utils";
import "./print-styles.css";

/** detailedStories の1件から表示用テキストを取得（string | JSONContent を string に正規化） */
function getStoryContent(
  value: string | JSONContent | undefined,
  fallback: string,
): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  // value は string | JSONContent に絞り込まれた状態（API の detailedStories の要素型）
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
  return getStoryText(value) || fallback;
}

interface PrintPreviewContentProps {
  metaGraphData: MetaGraphStoryData;
  originalGraphData: GraphDocumentForFrontend;
  layoutSettings: PrintLayoutSettings;
  /** シミュレーション再実行のトリガー（変更で再実行） */
  reSimulationTrigger?: number;
  workspaceId?: string;
  workspaceTitle?: string;
  onWorkspaceTitlePositionChange?: (pos: { x: number; y: number }) => void;
  onWorkspaceTitleSizeChange?: (size: { width: number; height: number }) => void;
  onSectionSizeChange?: (communityId: string, size: { width: number; height: number }) => void;
  onCommunityPositionChange?: (communityId: string, pos: { x: number; y: number }) => void;
  onNodePositionChange?: (nodeId: string, pos: { x: number; y: number }) => void;
}

export function PrintPreviewContent({
  metaGraphData,
  originalGraphData,
  layoutSettings,
  reSimulationTrigger,
  workspaceId,
  workspaceTitle,
  onWorkspaceTitlePositionChange,
  onWorkspaceTitleSizeChange,
  onSectionSizeChange,
  onCommunityPositionChange,
  onNodePositionChange,
}: PrintPreviewContentProps) {
  const [communityCenters, setCommunityCenters] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  const graphViewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 2000 });
  const [basePreviewSize, setBasePreviewSize] = useState<{ width: number; height: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // 保存されたフィルタがある場合はグラフを絞り込む
  const graphDataForView = useMemo(() => {
    const filter = metaGraphData.filter;
    if (!filter || !originalGraphData) return originalGraphData;
    const segmentNodeIds = getSegmentNodeIdsFromMetaGraphStoryData(metaGraphData);
    return filterGraphByLayoutInstruction(originalGraphData, filter, {
      segmentNodeIds: segmentNodeIds.length ? segmentNodeIds : undefined,
    });
  }, [originalGraphData, metaGraphData]);

  // ナラティブフローに従ってストーリーアイテムをソート
  const storyItems = useMemo(() => {
    if (!metaGraphData.narrativeFlow || metaGraphData.narrativeFlow.length === 0) {
      return [];
    }

    return metaGraphData.narrativeFlow
      .sort((a, b) => a.order - b.order)
      .map((flow) => {
        const summary = metaGraphData.summaries.find(
          (s) => s.communityId === flow.communityId,
        );
        const storyValue =
          metaGraphData.detailedStories[flow.communityId] as
          | string
          | JSONContent
          | undefined;
        const content = getStoryContent(storyValue, summary?.summary ?? "");
        return {
          communityId: flow.communityId,
          title: summary?.title ?? `コミュニティ ${flow.communityId}`,
          content: content || (summary?.summary ?? ""),
          order: flow.order,
        };
      });
  }, [metaGraphData]);

  // ページサイズをmm単位で取得
  const pageSizeInMm = useMemo(() => {
    if (layoutSettings.pageSize.mode === "template" && layoutSettings.pageSize.template) {
      const template = PAGE_SIZE_TEMPLATES[layoutSettings.pageSize.template];
      const isLandscape = layoutSettings.pageSize.orientation === "landscape";
      return {
        width: isLandscape ? template.height : template.width,
        height: isLandscape ? template.width : template.height,
      };
    } else {
      const unit = layoutSettings.pageSize.unit ?? "mm";
      const width = layoutSettings.pageSize.customWidth ?? 1116;
      const height = layoutSettings.pageSize.customHeight ?? 800;
      return {
        width: convertUnit(width, unit, "mm"),
        height: convertUnit(height, unit, "mm"),
      };
    }
  }, [layoutSettings.pageSize]);

  // 用紙の縦横比を計算
  const aspectRatio = useMemo(() => {
    return pageSizeInMm.width / pageSizeInMm.height;
  }, [pageSizeInMm]);

  // プレビューサイズを計算（画面に収まるようにスケール）
  useEffect(() => {
    const calculatePreviewSize = () => {
      if (!contentRef.current) return;

      const mmToPx = 3.779527559;
      const pageWidthPx = pageSizeInMm.width * mmToPx;
      const pageHeightPx = pageSizeInMm.height * mmToPx;

      // 親コンテナのサイズを取得
      const container = contentRef.current.parentElement;
      if (!container) return;

      const containerWidth = container.clientWidth - 40; // パディングを考慮
      const containerHeight = window.innerHeight * 0.9; // 画面の高さの90%

      // 縦横比を維持しながら、画面に収まるようにスケール
      let scale: number;
      if (pageWidthPx / containerWidth > pageHeightPx / containerHeight) {
        // 幅が制限になる場合
        scale = containerWidth / pageWidthPx;
      } else {
        // 高さが制限になる場合
        scale = containerHeight / pageHeightPx;
      }

      // スケールを適用（最小0.1、最大1.0）
      scale = Math.max(0.05, Math.min(1.0, scale));

      setBasePreviewSize({
        width: pageWidthPx * scale,
        height: pageHeightPx * scale,
      });
    };

    calculatePreviewSize();
    window.addEventListener("resize", calculatePreviewSize);
    return () => window.removeEventListener("resize", calculatePreviewSize);
  }, [pageSizeInMm]);

  // ズームを適用した表示サイズ
  const previewSize = useMemo(() => {
    if (!basePreviewSize) return null;
    return {
      width: basePreviewSize.width * zoomLevel,
      height: basePreviewSize.height * zoomLevel,
    };
  }, [basePreviewSize, zoomLevel]);

  // CSS変数を設定
  const pageStyle = useMemo(() => {
    const mmToPx = 3.779527559;
    const pageWidthPx = pageSizeInMm.width * mmToPx;
    const pageHeightPx = pageSizeInMm.height * mmToPx;
    return {
      "--page-width": `${pageSizeInMm.width}mm`,
      "--page-height": `${pageSizeInMm.height}mm`,
      "--page-width-px": `${pageWidthPx}px`,
      "--page-height-px": `${pageHeightPx}px`,
      "--page-aspect-ratio": aspectRatio.toString(),
      "--margin-top": `${layoutSettings.margins.top}mm`,
      "--margin-right": `${layoutSettings.margins.right}mm`,
      "--margin-bottom": `${layoutSettings.margins.bottom}mm`,
      "--margin-left": `${layoutSettings.margins.left}mm`,
    } as React.CSSProperties;
  }, [pageSizeInMm, layoutSettings.margins, aspectRatio]);

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 4;
  const ZOOM_STEP = 0.25;

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoomLevel((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + delta)));
    }
  };

  return (
    <div
      className="print-preview-container"
      style={{
        ...pageStyle,
        ...(zoomLevel > 1 && previewSize
          ? { width: "fit-content", minWidth: "100%", alignSelf: "flex-start" }
          : {}),
      }}
      onWheel={handleWheelZoom}
      role="application"
      aria-label="プリントプレビュー"
    >
      {/* ヘッダー（印刷時は非表示） */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
        {/* ズームコントロール */}
        <div className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 shadow-md no-print">
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
            disabled={zoomLevel <= ZOOM_MIN}
            className="flex h-8 w-8 items-center justify-center rounded bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="縮小"
          >
            −
          </button>
          <span className="min-w-[4rem] text-center text-sm font-medium text-slate-700">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
            disabled={zoomLevel >= ZOOM_MAX}
            className="flex h-8 w-8 items-center justify-center rounded bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="拡大"
          >
            +
          </button>
        </div>
        {workspaceId && (
          <PdfExportButton
            layoutSettings={layoutSettings}
            workspaceId={workspaceId}
            workspaceTitle={workspaceTitle}
          />
        )}
      </div>

      {/* プレビューコンテンツ（用紙の枠） */}
      <div
        ref={contentRef}
        className="print-content"
        style={{
          width: previewSize ? `${previewSize.width}px` : undefined,
          height: previewSize ? `${previewSize.height}px` : undefined,
          minWidth: previewSize ? `${previewSize.width}px` : undefined,
          aspectRatio: aspectRatio.toString(),
          maxWidth: zoomLevel > 1 ? "none" : "100%",
          maxHeight: zoomLevel > 1 ? "none" : "90vh",
          overflow: "hidden",
          margin: zoomLevel <= 1 ? "0 auto" : undefined,
        }}
      >
        {storyItems.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            ストーリーがありません
          </div>
        ) : (
          <div className="print-unified-graph-container" ref={graphViewRef} style={{ width: "100%", height: "100%", overflow: "hidden" }}>
            <PrintUnifiedGraphView
              metaGraphData={metaGraphData}
              originalGraphData={graphDataForView}
              layoutSettings={layoutSettings}
              reSimulationTrigger={reSimulationTrigger}
              storyItems={storyItems}
              previewSize={previewSize}
              workspaceTitle={workspaceTitle}
                  onWorkspaceTitlePositionChange={onWorkspaceTitlePositionChange}
                  onWorkspaceTitleSizeChange={onWorkspaceTitleSizeChange}
                  onSectionSizeChange={onSectionSizeChange}
                  onCommunityPositionChange={onCommunityPositionChange}
                  onNodePositionChange={onNodePositionChange}
              onCommunityPositionsCalculated={(centers) => {
                setCommunityCenters(centers);
                // キャンバスサイズを計算
                if (centers.size > 0 && graphViewRef.current) {
                  const rect = graphViewRef.current.getBoundingClientRect();
                  const maxX = Math.max(...Array.from(centers.values()).map(c => c.x));
                  const maxY = Math.max(...Array.from(centers.values()).map(c => c.y));
                  setCanvasSize({
                    width: Math.max(rect.width, maxX + 500),
                    height: Math.max(rect.height, maxY + 500),
                  });
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
