"use client";

import React, { useState } from "react";
import { api } from "@/trpc/react";
import type { MotionComparisonCacheGroup } from "@/app/const/skeleton-motion";

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

function ModelBadge({
  label,
  cached,
  frames,
  variant = "default",
}: {
  label: string;
  cached: boolean;
  frames: number | null;
  variant?: "default" | "omni" | "flood";
}) {
  const cachedClass =
    variant === "flood"
      ? "bg-cyan-500/15 text-cyan-300"
      : variant === "omni"
        ? "bg-violet-500/15 text-violet-300"
        : "bg-emerald-500/15 text-emerald-300";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
        cached ? cachedClass : "bg-gray-700 text-gray-500"
      }`}
    >
      {label}
      {cached && frames != null ? ` ${frames}f` : cached ? "" : " —"}
    </span>
  );
}

function CacheRow({
  group,
  isActive,
  isLoading,
  onLoad,
}: {
  group: MotionComparisonCacheGroup;
  isActive: boolean;
  isLoading: boolean;
  onLoad: () => void;
}) {
  const canLoad = Boolean(
    group.promptText &&
      group.momask &&
      group.omnicontrol &&
      !group.promptText.startsWith("[streaming]"),
  );
  const label =
    group.promptText ??
    `hash:${group.promptHash?.slice(0, 8) ?? group.groupKey.slice(0, 8)}`;

  return (
    <tr
      className={`border-b border-gray-700/60 ${
        isActive ? "bg-blue-500/10" : "hover:bg-gray-800/50"
      }`}
    >
      <td className="py-2 pr-3 text-sm text-gray-200 max-w-xs truncate" title={label}>
        {label}
      </td>
      <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
        {group.numFrames != null ? `${group.numFrames}f` : "—"}
      </td>
      <td className="py-2 pr-3">
        <div className="flex gap-1">
          <ModelBadge
            label="MoMask"
            cached={group.momask != null}
            frames={group.momask?.totalFrames ?? null}
          />
          <ModelBadge
            label="Omni"
            cached={group.omnicontrol != null}
            frames={group.omnicontrol?.totalFrames ?? null}
            variant="omni"
          />
          <ModelBadge
            label="Flood"
            cached={group.flooddiffusion != null}
            frames={group.flooddiffusion?.totalFrames ?? null}
            variant="flood"
          />
        </div>
      </td>
      <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
        {formatRelativeTime(new Date(group.updatedAt))}
      </td>
      <td className="py-2 text-right">
        <button
          type="button"
          onClick={onLoad}
          disabled={!canLoad || isLoading}
          className="rounded px-2 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          title={
            canLoad
              ? "キャッシュから比較結果を読み込む"
              : group.promptText?.startsWith("[streaming]")
                ? "ストリーミングキャッシュは Load 非対応"
                : "プロンプト原文がない、または MoMask/Omni が不足"
          }
        >
          {isLoading ? "..." : "Load"}
        </button>
      </td>
    </tr>
  );
}

export function MotionCachePanel({
  topicSpaceId,
  edgeId,
  activePrompt,
  loadingPrompt,
  onLoadComparison,
}: {
  topicSpaceId: string;
  edgeId: string;
  activePrompt: string;
  loadingPrompt: string | null;
  onLoadComparison: (promptText: string, numFrames: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const cacheQuery = api.kg.listSkeletonMotionCache.useQuery(
    { topicSpaceId, edgeId },
    { enabled: isOpen },
  );

  const groups = cacheQuery.data ?? [];

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 mb-6">
      <div className="flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left hover:opacity-90"
          aria-expanded={isOpen}
        >
          <span
            className={`mt-0.5 shrink-0 text-xs text-gray-500 transition-transform ${
              isOpen ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            ▶
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-200">
              キャッシュ一覧
              {!isOpen && groups.length > 0 && (
                <span className="ml-2 font-normal text-gray-500">
                  ({groups.length})
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              topicSpace: {topicSpaceId} / edge: {edgeId}
            </p>
          </div>
        </button>
        {isOpen && (
          <button
            type="button"
            onClick={() => void cacheQuery.refetch()}
            disabled={cacheQuery.isFetching}
            className="shrink-0 rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            {cacheQuery.isFetching ? "更新中..." : "更新"}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="border-t border-gray-700/80 px-4 pb-4 pt-3">
      {cacheQuery.isError && (
        <p className="text-sm text-red-300">{cacheQuery.error.message}</p>
      )}

      {cacheQuery.isLoading && (
        <p className="text-sm text-gray-500 py-4">読み込み中...</p>
      )}

      {!cacheQuery.isLoading && groups.length === 0 && (
        <p className="text-sm text-gray-500 py-4">
          キャッシュはまだありません。Generate & Compare で作成されます。
        </p>
      )}

      {groups.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-700">
                <th className="pb-2 pr-3 font-medium">Prompt</th>
                <th className="pb-2 pr-3 font-medium">MoMask req.</th>
                <th className="pb-2 pr-3 font-medium">Models</th>
                <th className="pb-2 pr-3 font-medium">Updated</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <CacheRow
                  key={group.groupKey}
                  group={group}
                  isActive={
                    group.promptText != null &&
                    group.promptText === activePrompt.trim()
                  }
                  isLoading={loadingPrompt === group.promptText}
                  onLoad={() => {
                    if (!group.promptText) return;
                    onLoadComparison(
                      group.promptText,
                      group.numFrames ?? 24,
                    );
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-600 mt-3">
        古いエントリは prompt 原文が未保存のため hash 表示のみです。Regenerate
        するとプロンプト付きで再キャッシュされます。
      </p>
        </div>
      )}
    </div>
  );
}
