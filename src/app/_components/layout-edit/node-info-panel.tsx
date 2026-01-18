"use client";

import type { CustomNodeType } from "@/app/const/types";
import { CrossLargeIcon } from "../icons";

interface NodeInfoPanelProps {
  node: CustomNodeType | null;
  onClose?: () => void;
}

export const NodeInfoPanel = ({ node, onClose }: NodeInfoPanelProps) => {
  if (!node) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-slate-900 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">
          ノード情報
        </h2>
        <p className="text-sm text-slate-400">
          グラフ上のノードをクリックすると、詳細情報が表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-slate-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">ノード情報</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <CrossLargeIcon width={16} height={16} color="white" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {/* 基本情報 */}
        <div className="flex flex-col gap-2">
          <div className="text-lg font-semibold text-slate-200">
            {node.name}
          </div>
          <div className="text-sm text-slate-400">ラベル: {node.label}</div>
          <div className="text-xs text-slate-500">ID: {node.id}</div>
        </div>

        <div className="border-t border-slate-700" />

        {/* プロパティ */}
        {Object.keys(node.properties ?? {}).length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-slate-300">プロパティ</h3>
            <div className="flex flex-col gap-2 text-sm">
              {Object.entries(node.properties ?? {}).map(
                ([key, value], index) => (
                  <div key={index} className="flex flex-col gap-1">
                    <div className="text-xs text-slate-400">{key}</div>
                    <div className="whitespace-pre-wrap break-words text-slate-200">
                      {typeof value === "string" &&
                      (value.startsWith("http://") ||
                        value.startsWith("https://")) ? (
                        <a
                          href={value}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 underline hover:text-blue-300"
                        >
                          {value}
                        </a>
                      ) : (
                        String(value ?? "")
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-400">プロパティがありません</div>
        )}

        {/* 統計情報 */}
        <div className="border-t border-slate-700" />
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-slate-300">統計情報</h3>
          <div className="flex flex-col gap-1 text-sm text-slate-400">
            <div>接続数: {node.neighborLinkCount ?? 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
