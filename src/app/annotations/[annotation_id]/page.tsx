"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { D3ForceGraph } from "@/app/_components/d3/force/graph";
import { AnnotationHierarchy } from "@/app/_components/curators-writing-workspace/annotation-hierarchy";
import { AnnotationForm } from "@/app/_components/curators-writing-workspace/annotation-form";
import { Button } from "@/app/_components/button/button";
import type {
  CustomNodeType,
  CustomLinkType,
  AnnotationResponse,
} from "@/app/const/types";
import { ChevronLeftIcon } from "@/app/_components/icons";

export default function AnnotationDetailPage() {
  const params = useParams();
  const annotationId = params.annotation_id as string;

  const [currentScale, setCurrentScale] = useState(1);
  const [focusedNode, setFocusedNode] = useState<CustomNodeType | undefined>();
  const [focusedLink, setFocusedLink] = useState<CustomLinkType | undefined>();
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [svgRef] = useState<React.RefObject<SVGSVGElement>>({ current: null });

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

  console.log(graphData);

  const handleRefetch = () => {
    void refetchAnnotation();
    void refetchParent();
    void refetchReplies();
    void refetchGraph();
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
      <div className="h-[calc(100vh-3rem)] w-1/2 overflow-y-auto p-4">
        <div className="mb-6 flex w-full flex-col gap-2">
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

          {/* 注釈階層表示 */}
          <AnnotationHierarchy
            currentAnnotation={annotation as AnnotationResponse}
            parentAnnotation={parentAnnotation as AnnotationResponse | null}
            childAnnotations={replies as AnnotationResponse[]}
            onRefetch={handleRefetch}
            topicSpaceId={annotation.targetNode?.topicSpaceId ?? ""}
          />

          {/* 返信追加ボタン */}
          <div className="mt-4 flex justify-end">
            <Button
              size="small"
              onClick={() => setShowAnnotationForm(true)}
              className="hover:bg-slate-600"
            >
              返信を追加
            </Button>
          </div>
        </div>

        {/* 注釈フォーム */}
        {showAnnotationForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <AnnotationForm
              targetType="annotation"
              targetId={annotationId}
              topicSpaceId={annotation.targetNode?.topicSpaceId ?? ""}
              parentAnnotationId={annotationId}
              onClose={() => setShowAnnotationForm(false)}
              onSuccess={() => {
                setShowAnnotationForm(false);
                handleRefetch();
              }}
            />
          </div>
        )}
      </div>

      {/* 右側: グラフ可視化 */}
      <div className="h-[calc(100vh-3rem)] w-1/2 p-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-200">関連グラフ</h3>
          <p className="text-sm text-gray-400">
            この注釈が付けられているノードとその周辺の関係
          </p>
        </div>

        {annotation.targetNodeId && graphData ? (
          <div className="h-[calc(100vh-12rem)] overflow-hidden rounded-lg border border-gray-700">
            <D3ForceGraph
              svgRef={svgRef}
              height={600}
              width={600}
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
          <div className="flex h-[calc(100vh-12rem)] items-center justify-center rounded-lg border border-gray-700">
            <div className="text-center text-gray-400">
              <p>この注釈はノードに関連付けられていません</p>
              <p className="mt-2 text-sm">
                返信注釈の場合は、親注釈の対象ノードが表示されます
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-[calc(100vh-12rem)] items-center justify-center rounded-lg border border-gray-700">
            <div className="text-gray-400">グラフデータを読み込み中...</div>
          </div>
        )}
      </div>
    </div>
  );
}
