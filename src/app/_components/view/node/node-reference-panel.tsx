"use client";

import React from "react";
import { api } from "@/trpc/react";
import type { CustomNodeType } from "@/app/const/types";

interface NodeReferencePanelProps {
  node: CustomNodeType;
  topicSpaceId: string;
}

export const NodeReferencePanel: React.FC<NodeReferencePanelProps> = ({
  node,
  topicSpaceId,
}) => {
  const {
    data: nodeReferences,
    isLoading,
    error,
  } = api.topicSpaces.getNodeReference.useQuery({
    id: topicSpaceId,
    nodeId: node.id,
  });

  const highlightText = (text: string, searchTerm: string) => {
    if (!searchTerm) return text;

    const regex = new RegExp(`(${searchTerm})`, "gi");
    return text.split(regex).map((part, index) =>
      regex.test(part) ? (
        <mark
          key={index}
          className="rounded bg-yellow-200 px-1 text-yellow-900"
        >
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-400">引用箇所を検索中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-400">
        <p>引用箇所の取得中にエラーが発生しました。</p>
      </div>
    );
  }

  if (!nodeReferences || nodeReferences.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        <p>「{node.name}」に関する引用箇所が見つかりませんでした。</p>
      </div>
    );
  }

  // 空でない結果のみをフィルタリング
  const filteredReferences = nodeReferences.filter(
    (ref) => ref.relevantSections && ref.relevantSections.length > 0,
  );

  if (filteredReferences.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        <p>「{node.name}」に関する引用箇所が見つかりませんでした。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <p className="mt-2 text-sm text-gray-400">
          {filteredReferences.length}個のドキュメントで言及されています
        </p>
      </div>

      <div className="space-y-4">
        {filteredReferences.map((reference) => (
          <div
            key={reference.sourceDocument.id}
            className="rounded-lg border border-slate-600 bg-slate-800/50 p-4"
          >
            <h4 className="mb-3 flex items-center font-semibold text-gray-200">
              <span className="mr-2 h-2 w-2 rounded-full bg-blue-400"></span>
              {reference.sourceDocument.name}
            </h4>
            <div className="space-y-3">
              {reference.relevantSections.map((section, index) => (
                <div
                  key={index}
                  className="rounded bg-slate-700/50 p-3 text-sm leading-relaxed text-gray-300"
                >
                  <div className="whitespace-pre-wrap">
                    {highlightText(section, node.name)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
