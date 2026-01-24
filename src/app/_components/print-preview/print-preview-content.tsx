"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { MetaGraphStoryData } from "@/app/_hooks/use-meta-graph-story";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { PrintLayoutSettings } from "./types";
import { PrintUnifiedGraphView } from "./print-unified-graph-view";
import { PdfExportButton } from "./pdf-export-button";
import { convertUnit, PAGE_SIZE_TEMPLATES } from "./types";
import "./print-styles.css";

interface PrintPreviewContentProps {
  metaGraphData: MetaGraphStoryData;
  originalGraphData: GraphDocumentForFrontend;
  layoutSettings: PrintLayoutSettings;
  workspaceId?: string;
}

export function PrintPreviewContent({
  metaGraphData,
  originalGraphData,
  layoutSettings,
  workspaceId,
}: PrintPreviewContentProps) {
  const [communityCenters, setCommunityCenters] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  const graphViewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 2000 });
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);

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
        const detailedStory = metaGraphData.detailedStories?.[flow.communityId];
        return {
          communityId: flow.communityId,
          title: summary?.title ?? `コミュニティ ${flow.communityId}`,
          content: detailedStory ?? summary?.summary ?? "",
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

      setPreviewSize({
        width: pageWidthPx * scale,
        height: pageHeightPx * scale,
      });
    };

    calculatePreviewSize();
    window.addEventListener("resize", calculatePreviewSize);
    return () => window.removeEventListener("resize", calculatePreviewSize);
  }, [pageSizeInMm]);

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

  return (
    <div className="print-preview-container" style={pageStyle}>
      {/* ヘッダー（印刷時は非表示） */}
      {workspaceId && (
        <div className="absolute top-4 right-4 z-10">
          <PdfExportButton layoutSettings={layoutSettings} workspaceId={workspaceId} />
        </div>
      )}

      {/* プレビューコンテンツ（用紙の枠） */}
      <div 
        ref={contentRef}
        className="print-content" 
        style={{ 
          width: previewSize ? `${previewSize.width}px` : undefined,
          aspectRatio: aspectRatio.toString(),
          maxWidth: "100%",
          maxHeight: "90vh",
          overflow: "hidden",
          margin: "0 auto",
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
              originalGraphData={originalGraphData}
              layoutSettings={layoutSettings}
              storyItems={storyItems}
              previewSize={previewSize}
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
