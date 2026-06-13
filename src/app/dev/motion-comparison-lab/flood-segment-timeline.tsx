"use client";

import React, { useMemo } from "react";
import { formatMotionTime } from "@/app/const/skeleton-motion";

/** Segment boundary metadata for streaming playback (matches API floodMeta.segments). */
type SegmentTimelineItem = {
  text: string;
  startToken?: number;
  endToken: number;
  startFrame?: number;
  endFrame: number;
};

const SEGMENT_COLORS = [
  "rgba(34, 211, 238, 0.35)",
  "rgba(56, 189, 248, 0.35)",
  "rgba(103, 232, 249, 0.35)",
  "rgba(165, 243, 252, 0.35)",
  "rgba(14, 165, 233, 0.35)",
] as const;

function previousEndFrame(
  segments: readonly SegmentTimelineItem[],
  index: number,
): number {
  if (index === 0) return 0;
  return segments[index - 1]?.endFrame ?? 0;
}

function segmentStartFrame(
  segments: readonly SegmentTimelineItem[],
  index: number,
): number {
  return segments[index]?.startFrame ?? previousEndFrame(segments, index);
}

function findActiveSegmentIndex(
  segments: readonly SegmentTimelineItem[],
  frame: number,
): number {
  if (segments.length === 0) return 0;

  for (const [index, seg] of segments.entries()) {
    const start = segmentStartFrame(segments, index);
    if (frame >= start && frame < seg.endFrame) {
      return index;
    }
  }

  return segments.length - 1;
}

type FloodSegmentTimelineProps = {
  segments: SegmentTimelineItem[];
  totalFrames: number;
  fps: number;
  progress: number;
  onScrub: (progress: number) => void;
};

export function FloodSegmentTimeline({
  segments,
  totalFrames,
  fps,
  progress,
  onScrub,
}: FloodSegmentTimelineProps) {
  const durationSec = totalFrames / fps;

  const activeIndex = useMemo(() => {
    const frame = progress * Math.max(totalFrames - 1, 0);
    return findActiveSegmentIndex(segments, frame);
  }, [progress, segments, totalFrames]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onScrub(Math.max(0, Math.min(1, x / rect.width)));
  };

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium text-cyan-300">
          Segment timeline
        </span>
        <span className="text-xs text-gray-500 tabular-nums">
          {formatMotionTime(progress * durationSec)} /{" "}
          {formatMotionTime(durationSec)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        onChange={(e) => onScrub(Number(e.target.value) / 1000)}
        className="w-full h-1.5 mb-2 rounded-lg appearance-none cursor-pointer bg-gray-700 accent-cyan-400"
        aria-label="FloodDiffusion segment timeline scrubber"
      />

      <div
        className="relative h-10 rounded-lg overflow-hidden cursor-pointer border border-gray-700/60"
        onClick={handleClick}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        {segments.map((seg, i) => {
          const startFrame = segmentStartFrame(segments, i);
          const startRatio = startFrame / Math.max(totalFrames, 1);
          const endRatio = seg.endFrame / Math.max(totalFrames, 1);
          const width = (endRatio - startRatio) * 100;
          const left = startRatio * 100;
          const isActive = i === activeIndex;

          return (
            <div
              key={`${seg.text}-${seg.endToken}`}
              className="absolute top-0 bottom-0 flex items-center px-1 overflow-hidden"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                outline: isActive ? "2px solid rgb(34 211 238)" : undefined,
                outlineOffset: -2,
              }}
              title={seg.text}
            >
              <span className="text-[10px] text-white/90 truncate">{seg.text}</span>
            </div>
          );
        })}

        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/90 pointer-events-none"
          style={{ left: `${progress * 100}%` }}
        />
      </div>

      <div className="mt-1 flex flex-wrap gap-2">
        {segments.map((seg, i) => (
          <span
            key={`legend-${seg.endToken}`}
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              i === activeIndex
                ? "bg-cyan-500/20 text-cyan-200"
                : "text-gray-500"
            }`}
          >
            {i + 1}. {seg.text.slice(0, 24)}
            {seg.text.length > 24 ? "…" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
