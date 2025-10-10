"use client";

import React, { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import type {
  AnnotationResponse,
  GraphDocumentForFrontend,
} from "@/app/const/types";
import { convertJsonToText } from "@/app/_utils/tiptap/convert";
import { GraphPreview } from "./graph-preview";

interface AnnotationGraphExtractionModalProps {
  annotations: AnnotationResponse[];
  topicSpaceId: string;
  onClose: () => void;
}

export const AnnotationGraphExtractionModal: React.FC<
  AnnotationGraphExtractionModalProps
> = ({ annotations, topicSpaceId, onClose }) => {
  const [selectedAnnotation, setSelectedAnnotation] =
    useState<AnnotationResponse | null>(null);
  const [extractedGraph, setExtractedGraph] =
    useState<GraphDocumentForFrontend | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractMode, setExtractMode] = useState("langChain");
  const [fileUrl, setFileUrl] = useState<string>();

  const previewGraphMutation =
    api.annotation.previewAnnotationGraph.useMutation();
  const createWithGraphData =
    api.sourceDocument.createWithGraphData.useMutation();
  const attachDocuments = api.topicSpaces.attachDocuments.useMutation();

  const handleExtractGraph = async (annotation: AnnotationResponse) => {
    setIsExtracting(true);
    setSelectedAnnotation(annotation);

    try {
      previewGraphMutation.mutate(
        {
          annotationId: annotation.id,
          extractMode,
        },
        {
          onSuccess: (data) => {
            setExtractedGraph(data.extractedGraph);
            setFileUrl(data.fileUrl);
          },
          onError: (error) => {
            console.error("グラフ抽出エラー:", error);
            alert("グラフ抽出に失敗しました");
          },
        },
      );
    } catch (error) {
      console.error("グラフ抽出エラー:", error);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleIntegrateGraph = async () => {
    if (!selectedAnnotation || !extractedGraph) return;

    try {
      // source-document.tsのcreateWithGraphDataを呼び出し
      if (!fileUrl) return;
      createWithGraphData.mutate(
        {
          name: `注釈から抽出: ${selectedAnnotation.type}`,
          url: fileUrl,
          dataJson: extractedGraph,
        },
        {
          onSuccess: (data) => {
            // topic-space.tsのattachDocumentsを呼び出し
            attachDocuments.mutate(
              {
                id: topicSpaceId,
                documentIds: [data.sourceDocument.id],
              },
              {
                onSuccess: (data) => {
                  alert("グラフの統合が完了しました");
                  onClose();
                },
                onError: (error) => {
                  console.error("グラフ統合エラー:", error);
                  alert("グラフの統合に失敗しました");
                },
              },
            );
          },
          onError: (error) => {
            console.error("ドキュメントの作成エラー:", error);
            alert("ドキュメントの作成に失敗しました");
          },
        },
      );
    } catch (error) {
      console.error("グラフ統合エラー:", error);
      alert("グラフの統合に失敗しました");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold">注釈からグラフ抽出</h3>
          <Button onClick={onClose} className="bg-gray-200 text-gray-800">
            ×
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 左側: 注釈選択 */}
          <div>
            <h4 className="mb-3 font-medium">抽出対象の注釈を選択</h4>

            {/* 抽出モード選択 */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                抽出モード
              </label>
              <select
                value={extractMode}
                onChange={(e) => setExtractMode(e.target.value)}
                className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="langChain">LangChain</option>
                <option value="assistants">Assistants API</option>
              </select>
            </div>

            <div className="max-h-96 space-y-3 overflow-y-auto">
              {annotations.map((annotation) => (
                <div
                  key={annotation.id}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                    selectedAnnotation?.id === annotation.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setSelectedAnnotation(annotation)}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {annotation.author.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(annotation.createdAt).toLocaleDateString(
                        "ja-JP",
                      )}
                    </span>
                  </div>
                  <div className="mb-2 text-sm text-gray-600">
                    {convertJsonToText(annotation.content).substring(0, 100)}
                    {convertJsonToText(annotation.content).length > 100 &&
                      "..."}
                  </div>
                  <Button
                    size="small"
                    onClick={() => handleExtractGraph(annotation)}
                    disabled={isExtracting}
                    className="w-full"
                  >
                    {isExtracting ? "抽出中..." : "グラフを抽出"}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* 右側: グラフプレビュー */}
          <div>
            <h4 className="mb-3 font-medium">抽出されたグラフ</h4>
            {extractedGraph ? (
              <div>
                <GraphPreview graphData={extractedGraph} />
                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={() => void handleIntegrateGraph()}
                    className="flex-1"
                  >
                    グラフを統合
                  </Button>
                  <Button
                    onClick={() => setExtractedGraph(null)}
                    className="border border-gray-300"
                  >
                    リセット
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                注釈を選択してグラフを抽出してください
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
