"use client";

import React, { useMemo } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/app/_components/button/button";
import { getStoryText } from "@/app/_hooks/use-meta-graph-story";
import type { JSONContent } from "@tiptap/react";

interface StoryHistoryModalProps {
  workspaceId: string;
  onClose: () => void;
}

/** getHistoryEntry の snapshotData の型（MetaGraphStoryData 相当） */
interface SnapshotDataLike {
  summaries?: Array<{ communityId: string; title: string; summary: string }>;
  narrativeFlow?: Array<{
    communityId: string;
    order: number;
    transitionText: string;
  }>;
  detailedStories?: Record<string, string | JSONContent>;
}

function formatHistoryDate(date: Date) {
  return new Date(date).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const StoryHistoryModal: React.FC<StoryHistoryModalProps> = ({
  workspaceId,
  onClose,
}) => {
  const [selectedHistoryId, setSelectedHistoryId] = React.useState<
    string | null
  >(null);

  const { data: histories, isLoading: isLoadingList } =
    api.story.listHistory.useQuery(
      { workspaceId },
      { enabled: !!workspaceId },
    );

  const { data: entry, isLoading: isLoadingEntry } =
    api.story.getHistoryEntry.useQuery(
      { historyId: selectedHistoryId! },
      { enabled: !!selectedHistoryId },
    );

  const historyStoryItems = useMemo(() => {
    if (!entry?.snapshotData) return [];
    const data = entry.snapshotData as SnapshotDataLike;
    const flow = data.narrativeFlow ?? [];
    const summaries = data.summaries ?? [];
    const detailedStories = data.detailedStories ?? {};
    return flow
      .map((f) => {
        const summary = summaries.find((s) => s.communityId === f.communityId);
        const rawStory = detailedStories[f.communityId];
        const description =
          rawStory != null
            ? typeof rawStory === "string"
              ? rawStory
              : getStoryText(rawStory)
            : summary?.summary ?? "";
        return {
          id: f.communityId,
          title: summary?.title ?? `コミュニティ ${f.communityId}`,
          description: description || summary?.summary ?? "",
          order: f.order,
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [entry?.snapshotData]);

  if (isLoadingList) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-lg bg-slate-800 p-8 text-white">
          読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-slate-800 shadow-xl md:flex-row">
        <div className="flex w-full flex-col border-b border-slate-700 md:w-72 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b border-slate-700 p-4">
            <h3 className="text-lg font-semibold text-white">ストーリー履歴</h3>
            <Button onClick={onClose} className="!bg-slate-600 !text-white">
              ×
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {!histories?.length ? (
              <p className="p-4 text-sm text-slate-400">履歴がありません</p>
            ) : (
              <ul className="space-y-1">
                {histories.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryId(h.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selectedHistoryId === h.id
                          ? "bg-slate-600 text-white"
                          : "text-slate-300 hover:bg-slate-700 hover:text-white"
                      }`}
                    >
                      <div className="font-medium">
                        {formatHistoryDate(h.createdAt)}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                        {h.savedBy.image && (
                          <img
                            src={h.savedBy.image}
                            alt=""
                            className="h-4 w-4 rounded-full"
                          />
                        )}
                        <span>{h.savedBy.name ?? "不明"}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {!selectedHistoryId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-slate-400">
              左の一覧から履歴を選択してください
            </div>
          ) : isLoadingEntry ? (
            <div className="flex flex-1 items-center justify-center p-8 text-slate-400">
              読み込み中...
            </div>
          ) : entry && historyStoryItems.length > 0 ? (
            <>
              <div className="border-b border-slate-700 p-3 text-sm text-slate-400">
                {formatHistoryDate(entry.createdAt)} の保存内容（読取専用）
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-6">
                  {historyStoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
                    >
                      <h4 className="mb-2 font-semibold text-white">
                        {item.title}
                      </h4>
                      <div className="whitespace-pre-wrap text-sm text-slate-300">
                        {item.description || "（本文なし）"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : entry ? (
            <div className="flex flex-1 items-center justify-center p-8 text-slate-400">
              この履歴にはストーリー構成がありません
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
