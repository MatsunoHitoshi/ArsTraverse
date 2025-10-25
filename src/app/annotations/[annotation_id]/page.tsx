"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import { AnnotationHierarchy } from "@/app/_components/curators-writing-workspace/annotation-hierarchy";
import { AnnotationForm } from "@/app/_components/curators-writing-workspace/annotation-form";
import { AnnotationMapVisualization } from "@/app/_components/curators-writing-workspace/annotation-map-visualization";
import { Button } from "@/app/_components/button/button";
import type {
  CustomNodeType,
  CustomLinkType,
  AnnotationResponse,
} from "@/app/const/types";
import { ChevronLeftIcon, ReplyIcon } from "@/app/_components/icons";
import { useWindowSize } from "@/app/_hooks/use-window-size";

export default function AnnotationDetailPage() {
  const params = useParams();
  const annotationId = params.annotation_id as string;

  const [currentScale, setCurrentScale] = useState(1);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>();
  const [focusedLink, setFocusedLink] = useState<CustomLinkType | undefined>();
  const [showAnnotationForm, setShowAnnotationForm] = useState<boolean>(false);
  const [svgRef] = useState<React.RefObject<SVGSVGElement>>({ current: null });
  const [activeTab, setActiveTab] = useState<"graph" | "map">("graph");

  const [innerWidth, innerHeight] = useWindowSize();
  const graphAreaWidth = (innerWidth ?? 100) / 2 - 34;
  const graphAreaHeight = (innerHeight ?? 300) - 144;

  // 注釈の詳細を取得
  const {
    data: annotation,
    isLoading: annotationLoading,
    refetch: refetchAnnotation,
  } = api.annotation.getAnnotationById.useQuery({
    id: annotationId,
  });

  // 注釈の親注釈を取得
  const { data: parentAnnotation, refetch: refetchParent } =
    api.annotation.getAnnotationParent.useQuery({
      annotationId: annotationId,
    });

  // 注釈の返信を取得
  const { data: replies, refetch: refetchReplies } =
    api.annotation.getAnnotationReplies.useQuery({
      parentAnnotationId: annotationId,
    });

  // 注釈が付けられているノードの周辺グラフを取得
  const { data: graphData, refetch: refetchGraph } =
    api.annotation.getAnnotationGraphContext.useQuery({
      annotationId: annotationId,
    });

  // 注釈クラスタリングを実行
  const {
    data: clusteringResult,
    isLoading: clusteringLoading,
    refetch: refetchClustering,
  } = api.annotation.performAnnotationClustering.useQuery(
    {
      targetNodeId: annotation?.targetNodeId ?? undefined,
      targetRelationshipId: annotation?.targetRelationshipId ?? undefined,
      topicSpaceId: annotation?.targetNode?.topicSpaceId ?? "",
      params: {
        featureExtraction: {
          maxFeatures: 1000,
          minDf: 2,
          maxDf: 0.95,
          includeMetadata: true,
          includeStructural: true,
        },
        dimensionalityReduction: {
          nNeighbors: 15,
          minDist: 0.1,
          spread: 1.0,
          nComponents: 2,
          randomSeed: 42,
        },
        clustering: {
          algorithm: "KMEANS",
          nClusters: 5,
          useElbowMethod: true,
          elbowMethodRange: {
            min: 2,
            max: 8,
          },
        },
      },
    },
    {
      enabled:
        activeTab === "map" &&
        !!annotation &&
        (!!annotation.targetNodeId || !!annotation.targetRelationshipId), // マップタブがアクティブで対象がある時のみ実行
    },
  );

  const handleRefetch = () => {
    void refetchAnnotation();
    void refetchParent();
    void refetchReplies();
    void refetchGraph();
    void refetchClustering();
  };

  if (annotationLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg text-gray-400">読み込み中...</div>
      </div>
    );
  }

  if (!annotation) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg text-gray-400">注釈が見つかりません</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-900 pt-12 text-white">
      {/* 左側: 注釈詳細と返信 */}
      <div className="flex h-[calc(100svh-3rem)] w-1/2 flex-col p-4">
        {/* 固定ヘッダー */}
        <div className="mb-6 flex-shrink-0">
          <div className="flex w-full flex-row items-center gap-4">
            <Button
              onClick={() => window.history.back()}
              className="flex !h-8 !w-8 items-center justify-center"
            >
              <div className="h-4 w-4">
                <ChevronLeftIcon height={16} width={16} color="white" />
              </div>
            </Button>

            <div className="flex w-full flex-row items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-400">
                {annotation.targetNode?.name ??
                  annotation.targetRelationship?.type ??
                  "注釈"}
              </h2>
              {annotation.targetNode && (
                <>
                  <div className="mx-2 h-4 border-l border-gray-600"></div>
                  <span className="text-sm text-gray-400">
                    {annotation.targetNode.label}
                  </span>
                </>
              )}
              {annotation.targetRelationship && (
                <>
                  <div className="mx-2 h-4 border-l border-gray-600"></div>
                  <span className="text-sm text-gray-400">
                    関係: {annotation.targetRelationship.type}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* スクロール可能な注釈階層表示 */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex w-full flex-col gap-2">
            {/* 注釈階層表示 */}
            <AnnotationHierarchy
              currentAnnotation={annotation as AnnotationResponse}
              parentAnnotation={parentAnnotation as AnnotationResponse | null}
              childAnnotations={replies as AnnotationResponse[]}
              onRefetch={handleRefetch}
              topicSpaceId={annotation.targetNode?.topicSpaceId ?? ""}
              setShowAnnotationForm={setShowAnnotationForm}
            />

            {/* 返信追加ボタン */}
            <div className="mt-4 flex justify-end">
              <Button
                size="small"
                onClick={() => setShowAnnotationForm(true)}
                className="flex flex-row items-center justify-center gap-1 hover:bg-slate-600"
              >
                <ReplyIcon width={16} height={16} color="white" />
                返信
              </Button>
            </div>
          </div>
        </div>

        {/* 注釈フォーム */}
        <AnnotationForm
          targetType="annotation"
          targetId={annotationId}
          topicSpaceId={annotation.targetNode?.topicSpaceId ?? ""}
          parentAnnotationId={annotationId}
          isOpen={showAnnotationForm}
          setIsOpen={setShowAnnotationForm}
          onSuccess={() => {
            handleRefetch();
          }}
        />
      </div>

      {/* 右側: グラフ可視化 */}
      <div className="h-[calc(100svh-3rem)] w-1/2 overflow-hidden p-4">
        {/* タブヘッダー */}
        <div className="mb-4">
          <div className="flex space-x-1 rounded-lg bg-slate-800 p-1">
            <button
              onClick={() => setActiveTab("graph")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "graph"
                  ? "bg-slate-700 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              関連グラフ
            </button>
            <button
              onClick={() => setActiveTab("map")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "map"
                  ? "bg-slate-700 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              注釈マップ
            </button>
          </div>
        </div>

        {/* タブの内容 */}
        <div className="overflow-auto">
          {activeTab === "graph" && (
            <>
              {annotation.targetNodeId && graphData ? (
                <div className="h-full overflow-hidden rounded-lg border border-gray-700">
                  <D3ForceGraph
                    svgRef={svgRef}
                    height={graphAreaHeight}
                    width={graphAreaWidth}
                    graphDocument={graphData}
                    currentScale={currentScale}
                    setCurrentScale={setCurrentScale}
                    focusedNode={focusedNode}
                    setFocusedNode={setFocusedNode}
                    focusedLink={focusedLink}
                    setFocusedLink={setFocusedLink}
                    isLargeGraph={false}
                    isGraphFullScreen={true}
                    isDirectedLinks={true}
                  />
                </div>
              ) : !annotation.targetNodeId ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-gray-700">
                  <div className="text-center text-gray-400">
                    <p>この注釈はノードに関連付けられていません</p>
                    <p className="mt-2 text-sm">
                      返信注釈の場合は、親注釈の対象ノードが表示されます
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-gray-700">
                  <div className="text-gray-400">
                    グラフデータを読み込み中...
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "map" && (
            <div className="h-full overflow-hidden rounded-lg border border-gray-700">
              {clusteringLoading ? (
                <div className="flex h-full flex-col items-center justify-center p-4">
                  <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500"></div>
                  <div className="text-center text-gray-400">
                    注釈をマッピング中...
                  </div>
                </div>
              ) : clusteringResult ? (
                <AnnotationMapVisualization
                  clusteringResult={clusteringResult.clustering}
                  rootAnnotationId={annotationId}
                  width={graphAreaWidth}
                  height={graphAreaHeight}
                  hierarchy={{
                    currentAnnotationId: annotation.id,
                    parentAnnotationId: parentAnnotation?.id ?? null,
                    childAnnotationIds: replies?.map((reply) => reply.id) ?? [],
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center text-gray-400">
                    <p>マッピングに失敗しました</p>
                    <Button
                      onClick={() => void refetchClustering()}
                      className="mt-4"
                      size="small"
                    >
                      再試行
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
