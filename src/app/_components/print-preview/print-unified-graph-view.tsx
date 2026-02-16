"use client";

import { useMemo, useRef, useState } from "react";
import type { MetaGraphStoryData } from "@/app/_hooks/use-meta-graph-story";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import { PrintGenerativeLayoutGraph } from "./print-generative-layout-graph";
import type { PrintLayoutSettings } from "./types";
import { convertUnit, PAGE_SIZE_TEMPLATES } from "./types";
import { buildScrollStepsFromMetaGraphStoryData } from "@/app/_utils/story-scroll-utils";

interface StoryItem {
  communityId: string;
  title: string;
  content: string;
  order: number;
}

interface PrintUnifiedGraphViewProps {
  metaGraphData: MetaGraphStoryData;
  originalGraphData: GraphDocumentForFrontend;
  layoutSettings: PrintLayoutSettings;
  onCommunityPositionsCalculated?: (positions: Map<string, { x: number; y: number }>) => void;
  storyItems?: StoryItem[];
  previewSize?: { width: number; height: number } | null;
  workspaceTitle?: string;
  onWorkspaceTitlePositionChange?: (pos: { x: number; y: number }) => void;
  onWorkspaceTitleSizeChange?: (size: { width: number; height: number }) => void;
  onSectionSizeChange?: (communityId: string, size: { width: number; height: number }) => void;
  onCommunityPositionChange?: (communityId: string, pos: { x: number; y: number }) => void;
  onNodePositionChange?: (nodeId: string, pos: { x: number; y: number }) => void;
}

export function PrintUnifiedGraphView({
  metaGraphData,
  originalGraphData,
  layoutSettings,
  onCommunityPositionsCalculated,
  storyItems = [],
  previewSize,
  workspaceTitle,
  onWorkspaceTitlePositionChange,
  onWorkspaceTitleSizeChange,
  onSectionSizeChange,
  onCommunityPositionChange,
  onNodePositionChange,
}: PrintUnifiedGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  // グラフのサイズを計算（プレビューサイズに基づく）
  const graphWidth = useMemo(() => {
    if (!previewSize) {
      // プレビューサイズがまだ計算されていない場合は、ページサイズに基づく
      const mmToPx = 3.779527559;
      const pageWidthPx = pageSizeInMm.width * mmToPx;
      const marginPx = (layoutSettings.margins.left + layoutSettings.margins.right) * mmToPx;
      return Math.max(1000, pageWidthPx - marginPx);
    }

    // プレビューサイズに基づいて計算（プレビューコンテナのサイズに合わせる）
    const marginRatio = (layoutSettings.margins.left + layoutSettings.margins.right) / pageSizeInMm.width;
    // プレビューサイズから余白を引く
    return previewSize.width * (1 - marginRatio);
  }, [pageSizeInMm, layoutSettings.margins, previewSize]);

  // グラフの高さは、コミュニティの位置が計算された後に動的に決定される
  const [calculatedGraphHeight, setCalculatedGraphHeight] = useState<number | null>(null);

  // 初期のグラフ高さを計算（プレビューサイズに基づく）
  const initialGraphHeight = useMemo(() => {
    if (!previewSize) {
      // プレビューサイズがまだ計算されていない場合は、ページサイズに基づく
      const mmToPx = 3.779527559;
      const baseHeight = pageSizeInMm.height * mmToPx;
      const marginPx = (layoutSettings.margins.top + layoutSettings.margins.bottom) * mmToPx;
      return Math.max(1000, baseHeight - marginPx);
    }

    // プレビューサイズに基づいて計算
    const marginRatio = (layoutSettings.margins.top + layoutSettings.margins.bottom) / pageSizeInMm.height;
    // プレビューサイズから余白を引く
    return previewSize.height * (1 - marginRatio);
  }, [pageSizeInMm, layoutSettings.margins, previewSize]);

  const graphHeight = calculatedGraphHeight ?? initialGraphHeight;

  // コンテナの高さに制限されたグラフの高さを計算
  const constrainedGraphHeight = useMemo(() => {
    // プレビューサイズがある場合は、その高さを基準にする
    if (previewSize) {
      const marginRatio = (layoutSettings.margins.top + layoutSettings.margins.bottom) / pageSizeInMm.height;
      const maxHeight = previewSize.height * (1 - marginRatio);
      return Math.min(graphHeight, maxHeight);
    }
    return graphHeight;
  }, [graphHeight, previewSize, layoutSettings.margins, pageSizeInMm.height]);

  // metaNodeDataを準備（orderを含む）
  const metaNodeData = useMemo(() => {
    if (!metaGraphData.narrativeFlow || metaGraphData.narrativeFlow.length === 0) {
      return [];
    }

    return metaGraphData.narrativeFlow
      .sort((a, b) => a.order - b.order)
      .map((flow) => {
        const summary = metaGraphData.summaries.find(
          (s) => s.communityId === flow.communityId,
        );
        return {
          communityId: flow.communityId,
          title: summary?.title,
          summary: summary?.summary,
          order: flow.order,
        };
      });
  }, [metaGraphData]);

  // ストーリー全セグメントで参照されているノード・エッジ（デフォルトで不透明度を分ける対象）
  const storyReferencedNodeIds = useMemo(() => {
    const steps = buildScrollStepsFromMetaGraphStoryData(metaGraphData);
    const ids = new Set<string>();
    steps.forEach((s) => s.nodeIds.forEach((id) => ids.add(id)));
    return ids.size > 0 ? ids : null;
  }, [metaGraphData]);

  const storyReferencedEdgeIds = useMemo(() => {
    const steps = buildScrollStepsFromMetaGraphStoryData(metaGraphData);
    const ids = new Set<string>();
    steps.forEach((s) => s.edgeIds.forEach((id) => ids.add(id)));
    return ids.size > 0 ? ids : null;
  }, [metaGraphData]);

  return (
    <div
      ref={containerRef}
      className="print-unified-graph-view"
      style={{
        width: "100%",
        height: "100%", // 親コンテナの高さに合わせる
        position: "relative",
        overflow: "hidden", // 見切れを防ぐ
      }}
    >
      <PrintGenerativeLayoutGraph
        width={graphWidth}
        height={constrainedGraphHeight}
        graphDocument={originalGraphData}
        filteredGraphDocument={metaGraphData.metaGraph}
        isLinkFiltered={false}
        nodeSearchQuery=""
        metaNodeData={metaNodeData}
        communityMap={metaGraphData.communityMap}
        originalGraphDocument={originalGraphData}
        onCommunityPositionsCalculated={(centers) => {
          // コミュニティの位置に基づいて実際のグラフの高さを計算
          if (centers.size > 0) {
            const maxY = Math.max(...Array.from(centers.values()).map(c => c.y));
            const minY = Math.min(...Array.from(centers.values()).map(c => c.y));
            // 余裕を持たせて高さを計算（上下に200pxの余白）
            const actualHeight = maxY - minY + 400;
            // プレビューサイズまたはページサイズを超えないように制限
            let maxPageHeight: number;
            if (previewSize) {
              const marginRatio = (layoutSettings.margins.top + layoutSettings.margins.bottom) / pageSizeInMm.height;
              maxPageHeight = previewSize.height * (1 - marginRatio);
            } else {
              const mmToPx = 3.779527559;
              maxPageHeight = (pageSizeInMm.height - layoutSettings.margins.top - layoutSettings.margins.bottom) * mmToPx;
            }
            const finalHeight = Math.min(actualHeight, maxPageHeight);
            setCalculatedGraphHeight(finalHeight);
          }
          // 元のコールバックも呼び出す
          onCommunityPositionsCalculated?.(centers);
        }}
        storyItems={storyItems}
        layoutSettings={layoutSettings}
        storyReferencedNodeIds={storyReferencedNodeIds}
        storyReferencedEdgeIds={storyReferencedEdgeIds}
        workspaceTitle={workspaceTitle}
              onWorkspaceTitlePositionChange={onWorkspaceTitlePositionChange}
              onWorkspaceTitleSizeChange={onWorkspaceTitleSizeChange}
              onSectionSizeChange={onSectionSizeChange}
              onCommunityPositionChange={onCommunityPositionChange}
              onNodePositionChange={onNodePositionChange}
      />
    </div>
  );
}
