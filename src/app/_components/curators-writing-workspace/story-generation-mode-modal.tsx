"use client";

import React, { useMemo } from "react";
import { Modal } from "../modal/modal";
import { Button } from "../button/button";
import type { JSONContent } from "@tiptap/react";
import { findEntityHighlights } from "@/app/_utils/text/find-entity-highlights";

export type StoryGenerationMode = "graph" | "text";

interface StoryGenerationModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModeSelected: (mode: StoryGenerationMode) => void;
  workspaceContent: JSONContent | null | undefined;
}

const MIN_ENTITIES_FOR_TEXT_MODE = 1;

export const StoryGenerationModeModal: React.FC<
  StoryGenerationModeModalProps
> = ({ isOpen, onClose, onModeSelected, workspaceContent }) => {
  const contentArray = useMemo(() => {
    const c = workspaceContent?.content;
    return Array.isArray(c) ? c : [];
  }, [workspaceContent?.content]);

  const entityCount = useMemo(
    () => findEntityHighlights(contentArray).length,
    [contentArray],
  );

  const hasEnoughContentForTextMode = useMemo(() => {
    const hasContent =
      contentArray.length > 0 &&
      contentArray.some((node) => {
        if (node.type === "paragraph" && node.content) {
          const text = (node.content as Array<{ type?: string; text?: string }>)
            .map((c) => (c.type === "text" ? c.text ?? "" : ""))
            .join("")
            .trim();
          return text.length > 0;
        }
        if (node.type === "heading" && node.content) {
          const text = (node.content as Array<{ type?: string; text?: string }>)
            .map((c) => (c.type === "text" ? c.text ?? "" : ""))
            .join("")
            .trim();
          return text.length > 0;
        }
        return false;
      });
    return hasContent && entityCount >= MIN_ENTITIES_FOR_TEXT_MODE;
  }, [contentArray, entityCount]);

  const handleSelect = (mode: StoryGenerationMode) => {
    if (mode === "text" && !hasEnoughContentForTextMode) {
      return;
    }
    onModeSelected(mode);
    // モーダルは generationMode がセットされると表示条件が false になり自動で消える。onClose はキャンセル時のみ呼ぶ
  };

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={(open) => {
        if (!open) onClose();
      }}
      title="ストーリーの生成方法を選択"
      size="large"
    >
      <div className="flex flex-col gap-6">
        <p className="text-sm text-slate-300">
          初回のストーリー生成では、次のどちらかを選んでください。
        </p>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => handleSelect("graph")}
            className="flex flex-col gap-2 rounded-lg border border-slate-600 bg-slate-800/50 p-4 text-left transition-colors hover:border-slate-500 hover:bg-slate-800"
          >
            <span className="font-semibold text-white">グラフから生成</span>
            <span className="text-sm text-slate-400">
              グラフの構造（Louvain クラスタリング）に基づいてコミュニティを決め、AI
              が各コミュニティのストーリー本文を生成します。
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelect("text")}
            disabled={!hasEnoughContentForTextMode}
            className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${
              hasEnoughContentForTextMode
                ? "border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800"
                : "cursor-not-allowed border-slate-700 bg-slate-900/50 opacity-70"
            }`}
          >
            <span className="font-semibold text-white">テキストから生成</span>
            <span className="text-sm text-slate-400">
              いま編集している文章の見出し2（Heading2）をセクションとして、段落（Segment）とグラフのノードを対応づけます。本文は既存のテキストをそのまま使います。
            </span>
            {!hasEnoughContentForTextMode && (
              <span className="text-xs text-amber-400">
                テキストから生成するには、見出し2でセクションを分け、グラフのノード名をエンティティとして文章中に含めてください。未入力やエンティティが少ない場合は「グラフから生成」を選んでください。
              </span>
            )}
          </button>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onClose}
            className="bg-slate-600 hover:bg-slate-700"
          >
            キャンセル
          </Button>
        </div>
      </div>
    </Modal>
  );
};
