"use client";

import React from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";

interface GraphPreviewProps {
  graphData: GraphDocumentForFrontend;
}

export const GraphPreview: React.FC<GraphPreviewProps> = ({ graphData }) => {
  return (
    <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
      <div className="mb-4">
        <h5 className="mb-2 font-medium text-gray-700">
          ノード ({graphData.nodes.length}件)
        </h5>
        <div className="max-h-40 space-y-2 overflow-y-auto">
          {graphData.nodes.map((node) => (
            <div
              key={node.id}
              className="flex items-center justify-between rounded border bg-white p-2"
            >
              <div>
                <span className="font-medium text-gray-800">{node.name}</span>
                <span className="ml-2 text-sm text-gray-600">
                  ({node.label})
                </span>
              </div>
              {node.properties && Object.keys(node.properties).length > 0 && (
                <div className="text-xs text-gray-500">
                  {Object.keys(node.properties).length}個のプロパティ
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h5 className="mb-2 font-medium text-gray-700">
          リレーションシップ ({graphData.relationships.length}件)
        </h5>
        <div className="max-h-40 space-y-2 overflow-y-auto">
          {graphData.relationships.map((rel) => (
            <div
              key={rel.id}
              className="flex items-center justify-between rounded border bg-white p-2"
            >
              <div>
                <span className="text-sm text-gray-800">
                  {rel.sourceId} → {rel.targetId}
                </span>
                <span className="ml-2 text-sm text-gray-600">({rel.type})</span>
              </div>
              {rel.properties && Object.keys(rel.properties).length > 0 && (
                <div className="text-xs text-gray-500">
                  {Object.keys(rel.properties).length}個のプロパティ
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {graphData.nodes.length === 0 && graphData.relationships.length === 0 && (
        <div className="py-8 text-center text-gray-500">
          グラフデータがありません
        </div>
      )}
    </div>
  );
};
