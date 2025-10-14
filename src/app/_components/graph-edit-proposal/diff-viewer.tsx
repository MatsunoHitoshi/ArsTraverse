"use client";

import React from "react";
import { GraphChangeType, GraphChangeEntityType } from "@prisma/client";

interface Change {
  changeType: GraphChangeType;
  changeEntityType: GraphChangeEntityType;
  changeEntityId: string;
  previousState: { nodes: unknown[]; relationships: unknown[] };
  nextState: { nodes: unknown[]; relationships: unknown[] };
}

interface DiffViewerProps {
  changes: Change[];
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ changes }) => {
  if (changes.length === 0) {
    return <div className="text-sm text-gray-500">変更内容がありません</div>;
  }

  return (
    <div className="space-y-4">
      {changes.map((change, index) => (
        <div key={index} className="rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${
                change.changeType === GraphChangeType.UPDATE
                  ? "bg-blue-100 text-blue-800"
                  : change.changeType === GraphChangeType.ADD
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
              }`}
            >
              {change.changeType === GraphChangeType.UPDATE && "更新"}
              {change.changeType === GraphChangeType.ADD && "追加"}
              {change.changeType === GraphChangeType.REMOVE && "削除"}
            </span>
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${
                change.changeEntityType === GraphChangeEntityType.NODE
                  ? "bg-purple-100 text-purple-800"
                  : "bg-orange-100 text-orange-800"
              }`}
            >
              {change.changeEntityType === GraphChangeEntityType.NODE
                ? "ノード"
                : "エッジ"}
            </span>
            <span className="text-sm text-gray-600">
              ID: {change.changeEntityId}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-700">変更前</h4>
              <div className="rounded border border-red-200 bg-red-50 p-3">
                <pre className="whitespace-pre-wrap text-xs text-gray-600">
                  {JSON.stringify(change.previousState, null, 2)}
                </pre>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-700">変更後</h4>
              <div className="rounded border border-green-200 bg-green-50 p-3">
                <pre className="whitespace-pre-wrap text-xs text-gray-600">
                  {JSON.stringify(change.nextState, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
