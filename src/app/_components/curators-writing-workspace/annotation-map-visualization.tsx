"use client";

import React, { useState, useMemo, useEffect } from "react";
import * as d3 from "d3";
import { AnnotationMapD3Visualization } from "../d3/annotation-map/annotation-map-d3-visualization";
import { convertJsonToText } from "@/app/_utils/tiptap/convert";
import { api } from "@/trpc/react";
import type { ClusteringResult } from "@/app/const/types";
import Link from "next/link";

interface AnnotationMapVisualizationProps {
  clusteringResult: ClusteringResult;
  rootAnnotationId: string;
  width: number;
  height: number;
  // 階層関係データ
  hierarchy?: {
    currentAnnotationId: string;
    parentAnnotationId?: string | null;
    childAnnotationIds: string[];
  };
}

export function AnnotationMapVisualization({
  clusteringResult,
  rootAnnotationId: _rootAnnotationId,
  width,
  height,
  hierarchy,
}: AnnotationMapVisualizationProps) {
  // ズーム機能のための状態
  const [currentScale, setCurrentScale] = useState(1);
  const [currentTransformX, setCurrentTransformX] = useState(0);
  const [currentTransformY, setCurrentTransformY] = useState(0);

  // 選択されたクラスターの状態
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(
    null,
  );
  // 選択された注釈の状態
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);

  // クラスターに含まれる注釈IDを取得
  const clusterAnnotationIds = useMemo(() => {
    const allIds = new Set<string>();
    clusteringResult.clusters.forEach((cluster) => {
      cluster.annotationIds.forEach((id) => allIds.add(id));
    });
    return Array.from(allIds);
  }, [clusteringResult.clusters]);

  // 必要な注釈のみを取得（パフォーマンス最適化）
  const { data: annotations = [] } =
    api.annotation.getAnnotationsByIds.useQuery(
      {
        annotationIds: clusterAnnotationIds,
      },
      {
        enabled: clusterAnnotationIds.length > 0,
        staleTime: 5 * 60 * 1000, // 5分間キャッシュ
      },
    );

  // クラスタークリックハンドラー
  const handleClusterClick = (clusterId: number) => {
    setSelectedClusterId(clusterId);
  };

  // 選択されたアノテーションの位置に注釈一覧をスクロール
  useEffect(() => {
    if (!selectedAnnotationId) return;

    // 少し遅延させてDOMが更新されるのを待つ
    const timer = setTimeout(() => {
      const element = document.getElementById(
        `annotation-${selectedAnnotationId}`,
      );
      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [selectedAnnotationId, annotations]);

  return (
    <div className="flex h-full flex-col" style={{ height: `${height}px` }}>
      {/* 可視化エリア */}
      <div className="flex-shrink-0">
        <AnnotationMapD3Visualization
          clusteringResult={clusteringResult}
          currentScale={currentScale}
          setCurrentScale={setCurrentScale}
          currentTransformX={currentTransformX}
          setCurrentTransformX={setCurrentTransformX}
          currentTransformY={currentTransformY}
          setCurrentTransformY={setCurrentTransformY}
          selectedClusterId={selectedClusterId}
          onClusterClick={handleClusterClick}
          width={width}
          height={height - 300}
          annotations={annotations}
          selectedAnnotationId={selectedAnnotationId}
          setSelectedAnnotationId={setSelectedAnnotationId}
          hierarchy={hierarchy}
        />
      </div>

      {/* クラスター詳細 */}
      <div
        className="flex flex-1 flex-col border-t border-gray-700"
        style={{ height: "300px" }}
      >
        {/* コンパクトなヘッダー情報 */}
        <div className="flex-shrink-0 p-3 pb-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h4 className="text-sm font-semibold text-white">グループ一覧</h4>
              <div className="text-xs text-gray-400">
                {clusteringResult.algorithm} |{" "}
                {clusteringResult.clusters?.length ?? 0}グループ
              </div>
            </div>
            {/* {clusteringResult.qualityMetrics?.silhouetteScore && (
              <div className="text-xs text-gray-400">
                グルーピング精度:{" "}
                <span className="font-bold text-blue-400">
                  {clusteringResult.qualityMetrics.silhouetteScore.toFixed(3)}
                </span>
              </div>
            )} */}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 pt-0">
          <div className="space-y-2">
            {(clusteringResult.clusters ?? []).map((cluster) => {
              const clusterAnnotations = annotations.filter((annotation) =>
                cluster.annotationIds.includes(annotation.id),
              );
              const isSelected = selectedClusterId === cluster.clusterId;

              return (
                <div
                  key={cluster.clusterId}
                  className={`rounded p-3 text-sm transition-colors ${
                    isSelected
                      ? "border border-orange-600 bg-orange-900/20"
                      : "bg-slate-800 hover:bg-slate-500"
                  }`}
                  onClick={() => setSelectedClusterId(cluster.clusterId)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor:
                            d3.schemeCategory10[cluster.clusterId % 10],
                        }}
                      />
                      <span className="font-medium text-white">
                        {cluster.title ?? `グループ ${cluster.clusterId}`}
                      </span>
                    </div>
                    <div className="text-gray-400">{cluster.size}件</div>
                  </div>

                  {/* クラスターに属する注釈の詳細 */}
                  <div className="flex flex-col gap-1">
                    {clusterAnnotations.map((annotation) => (
                      <Link
                        href={`/annotations/${annotation.id}`}
                        key={annotation.id}
                      >
                        <div
                          id={`annotation-${annotation.id}`}
                          className={`rounded p-2 text-xs transition-colors ${
                            selectedAnnotationId === annotation.id
                              ? "border border-orange-500 bg-slate-900"
                              : "bg-slate-700"
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span className="font-medium text-blue-400">
                              {annotation.type}
                            </span>
                            <span className="text-gray-400">
                              {annotation.author.name}
                            </span>
                          </div>
                          <div className="line-clamp-2 text-gray-300">
                            {convertJsonToText(annotation.content)}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
