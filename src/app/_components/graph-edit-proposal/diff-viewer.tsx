"use client";

import React, { useState } from "react";
import { GraphChangeType, GraphChangeEntityType } from "@prisma/client";
import { VisualDiffViewer } from "./visual-diff-viewer";
import { Button } from "../button/button";

interface Change {
  id: string;
  proposalId: string;
  changeType: GraphChangeType;
  changeEntityType: GraphChangeEntityType;
  changeEntityId: string;
  previousState: Record<string, unknown>;
  nextState: Record<string, unknown>;
  createdAt: Date;
}

interface DiffViewerProps {
  changes: Change[];
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ changes }) => {
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");

  if (changes.length === 0) {
    return <div className="text-sm text-gray-500">変更内容がありません</div>;
  }

  return (
    <div className="space-y-4">
      {/* 表示モード切り替え */}
      <div className="mb-4 flex h-[46px] flex-row items-end gap-4">
        <div
          className={`border-b-2 border-transparent ${
            viewMode === "visual" && "!border-slate-50 font-semibold"
          }`}
        >
          <Button
            onClick={() => setViewMode("visual")}
            className="flex cursor-pointer flex-row items-center gap-1 bg-transparent py-2 hover:bg-slate-50/10"
          >
            <div>一覧</div>
          </Button>
        </div>
        <div
          className={`border-b-2 border-transparent ${
            viewMode === "json" && "!border-slate-50 font-semibold"
          }`}
        >
          <Button
            onClick={() => setViewMode("json")}
            className="flex cursor-pointer flex-row items-center gap-1 bg-transparent py-2 hover:bg-slate-50/10"
          >
            <div>JSON表示</div>
          </Button>
        </div>
      </div>

      {/* 表示内容 */}
      {viewMode === "visual" ? (
        <VisualDiffViewer changes={changes} />
      ) : (
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
                  <h4 className="mb-2 text-sm font-semibold">変更前</h4>
                  <div className="rounded-lg bg-pink-950/40 p-2">
                    <pre className="text-xs">
                      <code style={{ whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(change.previousState, null, 2)}
                      </code>
                    </pre>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold">変更後</h4>
                  <div className="rounded-lg bg-green-950/40 p-2">
                    <pre className="text-xs">
                      <code style={{ whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(change.nextState, null, 2)}
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
