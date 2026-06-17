"use client";

import React from "react";
import type { FloodDiffusionSegmentInput } from "@/app/const/skeleton-motion";
import { floodApproxFramesFromLatentTokens } from "@/app/const/skeleton-motion";
import {
  CUSTOM_FLOOD_STREAMING_ID,
  FLOOD_STREAMING_PRESETS,
} from "@/app/const/motion-prompt-presets";

type FloodSegmentEditorProps = {
  segments: FloodDiffusionSegmentInput[];
  selectedStreamingPresetId: string;
  onSegmentsChange: (segments: FloodDiffusionSegmentInput[]) => void;
  onStreamingPresetChange: (presetId: string) => void;
};

export function FloodSegmentEditor({
  segments,
  selectedStreamingPresetId,
  onSegmentsChange,
  onStreamingPresetChange,
}: FloodSegmentEditorProps) {
  const totalTokens = segments[segments.length - 1]?.endToken ?? 0;

  const updateSegment = (
    index: number,
    patch: Partial<FloodDiffusionSegmentInput>,
  ) => {
    const next = segments.map((seg, i) =>
      i === index ? { ...seg, ...patch } : seg,
    );
    onSegmentsChange(next);
  };

  const addSegment = () => {
    const lastEnd = segments[segments.length - 1]?.endToken ?? 0;
    onSegmentsChange([
      ...segments,
      { text: "a person walks forward", endToken: lastEnd + 20 },
    ]);
    onStreamingPresetChange(CUSTOM_FLOOD_STREAMING_ID);
  };

  const removeSegment = (index: number) => {
    if (segments.length <= 1) return;
    onSegmentsChange(segments.filter((_, i) => i !== index));
    onStreamingPresetChange(CUSTOM_FLOOD_STREAMING_ID);
  };

  const handlePresetChange = (presetId: string) => {
    onStreamingPresetChange(presetId);
    if (presetId === CUSTOM_FLOOD_STREAMING_ID) return;
    const preset = FLOOD_STREAMING_PRESETS.find((p) => p.id === presetId);
    if (preset) onSegmentsChange(preset.segments);
  };

  return (
    <div className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 className="text-xs font-semibold text-cyan-300 uppercase tracking-wide">
          Streaming Segments
        </h4>
        <select
          value={selectedStreamingPresetId}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-white"
        >
          {FLOOD_STREAMING_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
          <option value={CUSTOM_FLOOD_STREAMING_ID}>カスタム</option>
        </select>
      </div>

      <div className="space-y-2">
        {segments.map((seg, index) => {
          const prevEndToken = index === 0 ? 0 : (segments[index - 1]?.endToken ?? 0);
          const durationTokens = seg.endToken - prevEndToken;
          return (
          <div
            key={index}
            className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-700/60 bg-gray-900/40 p-2"
          >
            <span className="text-xs text-gray-500 w-6 shrink-0">
              {index + 1}
            </span>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[10px] text-gray-500 mb-0.5">
                Text
              </label>
              <input
                type="text"
                value={seg.text}
                onChange={(e) => {
                  updateSegment(index, { text: e.target.value });
                  onStreamingPresetChange(CUSTOM_FLOOD_STREAMING_ID);
                }}
                className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white"
              />
            </div>
            <div className="w-24">
              <label className="block text-[10px] text-gray-500 mb-0.5">
                endToken
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={seg.endToken}
                onChange={(e) => {
                  updateSegment(index, {
                    endToken: Math.max(1, Math.min(120, Number(e.target.value))),
                  });
                  onStreamingPresetChange(CUSTOM_FLOOD_STREAMING_ID);
                }}
                className="w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white"
              />
            </div>
            <div className="text-[10px] text-gray-500 pb-1.5 tabular-nums">
              {durationTokens} tok · ≈
              {floodApproxFramesFromLatentTokens(durationTokens)}f
            </div>
            <button
              type="button"
              onClick={() => removeSegment(index)}
              disabled={segments.length <= 1}
              className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-30"
            >
              Remove
            </button>
          </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={addSegment}
          className="rounded px-3 py-1 text-xs font-medium text-cyan-300 border border-cyan-700/50 hover:bg-cyan-500/10"
        >
          + Add Segment
        </button>
        <span className="text-xs text-gray-500 tabular-nums">
          Total: {totalTokens} tokens · ≈
          {floodApproxFramesFromLatentTokens(totalTokens)} frames
        </span>
      </div>
    </div>
  );
}
