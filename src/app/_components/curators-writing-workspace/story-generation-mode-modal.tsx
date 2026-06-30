"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
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
  hasReferencedTopicSpace: boolean;
  isProcessing?: boolean;
  processingMode?: StoryGenerationMode | null;
}

const MIN_ENTITIES_FOR_TEXT_MODE = 1;

export const StoryGenerationModeModal: React.FC<
  StoryGenerationModeModalProps
> = ({
  isOpen,
  onClose,
  onModeSelected,
  workspaceContent,
  hasReferencedTopicSpace,
  isProcessing = false,
  processingMode = null,
}) => {
  const t = useTranslations("workspace");
  const tCommon = useTranslations("common");

  const textModeProcessingSteps = useMemo(
    () => [
      t("storyProcessingStep1"),
      t("storyProcessingStep2"),
      t("storyProcessingStep3"),
    ],
    [t],
  );

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
    if (mode === "graph" && !hasReferencedTopicSpace) {
      return;
    }
    if (mode === "text" && !hasEnoughContentForTextMode) {
      return;
    }
    onModeSelected(mode);
  };

  const showProcessing = isProcessing && processingMode === "text";

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={(open) => {
        if (!open && !showProcessing) onClose();
      }}
      title={
        showProcessing ? t("storyGenerating") : t("storyGenerationMethod")
      }
      size="large"
    >
      <div className="flex flex-col gap-6">
        {showProcessing ? (
          <>
            <p className="text-sm text-slate-300">
              {t("storyProcessingDescription")}
            </p>
            <div className="flex flex-col gap-3 py-4">
              {textModeProcessingSteps.map((step, idx) => (
                <div
                  key={step}
                  className="flex items-center gap-3 rounded-lg border border-slate-600 bg-slate-800/30 px-4 py-3"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-cyan-400" />
                  </div>
                  <span className="text-sm text-slate-300">
                    {idx + 1}. {step}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {t("storyProcessingAutoClose")}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300">{t("storyFirstGeneration")}</p>

            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => handleSelect("graph")}
                disabled={!hasReferencedTopicSpace}
                className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${hasReferencedTopicSpace
                  ? "border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800"
                  : "cursor-not-allowed border-slate-700 bg-slate-900/50 opacity-70"
                  }`}
              >
                <span className="font-semibold text-white">
                  {t("generateFromGraph")}
                </span>
                <span className="text-sm text-slate-400">
                  {t("generateFromGraphDescription")}
                </span>
                {!hasReferencedTopicSpace && (
                  <span className="text-xs text-amber-400">
                    {t("generateFromGraphRequiresRepo")}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelect("text")}
                disabled={!hasEnoughContentForTextMode}
                className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${hasEnoughContentForTextMode
                  ? "border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800"
                  : "cursor-not-allowed border-slate-700 bg-slate-900/50 opacity-70"
                  }`}
              >
                <span className="font-semibold text-white">
                  {t("generateFromText")}
                </span>
                <span className="text-sm text-slate-400">
                  {t("generateFromTextDescription")}
                </span>
                {!hasEnoughContentForTextMode && (
                  <span className="text-xs text-amber-400">
                    {t("generateFromTextRequiresContent")}
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
                {tCommon("cancel")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
