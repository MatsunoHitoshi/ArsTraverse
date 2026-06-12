"use client";

import React, { useMemo } from "react";
import type { SkeletonMotionData } from "@/app/const/skeleton-motion";
import {
  computeFrameIntensity,
  formatMotionTime,
  progressToFrameIndex,
} from "@/app/const/skeleton-motion";

type MotionPlaybackControlsProps = {
  isPlaying: boolean;
  loop: boolean;
  onTogglePlay: () => void;
  onLoopChange: (loop: boolean) => void;
  momaskDurationSec: number;
  omnicontrolDurationSec: number;
  flooddiffusionDurationSec?: number;
  momaskProgress: number;
  omnicontrolProgress: number;
  flooddiffusionProgress?: number;
};

export function MotionPlaybackControls({
  isPlaying,
  loop,
  onTogglePlay,
  onLoopChange,
  momaskDurationSec,
  omnicontrolDurationSec,
  flooddiffusionDurationSec = 0,
  momaskProgress,
  omnicontrolProgress,
  flooddiffusionProgress = 0,
}: MotionPlaybackControlsProps) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onTogglePlay}
          className="rounded-lg bg-gray-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-600 transition-colors"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => onLoopChange(e.target.checked)}
            className="rounded border-gray-600 bg-gray-700"
          />
          Loop
        </label>

        <div className="ml-auto flex flex-col gap-0.5 text-xs text-gray-400 tabular-nums text-right">
          <span>
            <span className="text-emerald-400">MoMask</span>{" "}
            {formatMotionTime(momaskProgress * momaskDurationSec)} /{" "}
            {formatMotionTime(momaskDurationSec)}
          </span>
          <span>
            <span className="text-violet-400">OmniControl</span>{" "}
            {formatMotionTime(omnicontrolProgress * omnicontrolDurationSec)} /{" "}
            {formatMotionTime(omnicontrolDurationSec)}
          </span>
          {flooddiffusionDurationSec > 0 && (
            <span>
              <span className="text-cyan-400">FloodDiffusion</span>{" "}
              {formatMotionTime(
                flooddiffusionProgress * flooddiffusionDurationSec,
              )}{" "}
              / {formatMotionTime(flooddiffusionDurationSec)}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        各モデルは独自の時間軸で再生します。スクラブは各パネルのタイムラインを使ってください。
      </p>
    </div>
  );
}

type MotionIntensityTimelineProps = {
  label: string;
  accentColor: string;
  motionData: SkeletonMotionData;
  progress: number;
  onScrub: (progress: number) => void;
  showScrubber?: boolean;
};

export function MotionIntensityTimeline({
  label,
  accentColor,
  motionData,
  progress,
  onScrub,
  showScrubber = true,
}: MotionIntensityTimelineProps) {
  const { fps, frames } = motionData;
  const totalFrames = frames.length;
  const durationSec = totalFrames / fps;
  const frameIndex = progressToFrameIndex(progress, totalFrames);
  const displayFrame = Math.round(frameIndex);

  const intensities = useMemo(() => computeFrameIntensity(frames), [frames]);

  const { path, maxIntensity } = useMemo(() => {
    if (intensities.length < 2) {
      return { path: "", maxIntensity: 1 };
    }
    const max = Math.max(...intensities, 0.001);
    const w = 280;
    const h = 48;
    const pad = 2;

    const points = intensities.map((v, i) => {
      const x = pad + (i / (intensities.length - 1)) * (w - pad * 2);
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${x},${y}`;
    });

    return { path: `M ${points.join(" L ")}`, maxIntensity: max };
  }, [intensities]);

  const playheadX =
    totalFrames <= 1 ? 0 : (frameIndex / (totalFrames - 1)) * 280;

  const handleChartClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const next = Math.max(0, Math.min(1, x / rect.width));
    onScrub(next);
  };

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <span className="text-xs text-gray-500 tabular-nums">
          frame {displayFrame + 1}/{totalFrames} ·{" "}
          {formatMotionTime(displayFrame / fps)} / {formatMotionTime(durationSec)}
        </span>
      </div>

      {showScrubber && (
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => onScrub(Number(e.target.value) / 1000)}
          className="w-full h-1.5 mb-2 rounded-lg appearance-none cursor-pointer bg-gray-700 accent-current"
          style={{ accentColor }}
          aria-label={`${label} timeline scrubber`}
        />
      )}

      <svg
        width="100%"
        viewBox="0 0 280 48"
        className="rounded bg-gray-900/60 cursor-pointer"
        onClick={handleChartClick}
        role="slider"
        aria-label={`${label} motion intensity timeline`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        {path && (
          <path
            d={path}
            fill="none"
            stroke={accentColor}
            strokeWidth={1.5}
            strokeOpacity={0.85}
          />
        )}
        <line
          x1={playheadX}
          y1={0}
          x2={playheadX}
          y2={48}
          stroke="white"
          strokeWidth={1.5}
          strokeOpacity={0.9}
        />
        <circle
          cx={playheadX}
          cy={4}
          r={3}
          fill="white"
        />
      </svg>

      <div className="flex justify-between text-[10px] text-gray-600 mt-0.5 px-0.5">
        <span>0</span>
        <span className="text-gray-500">
          intensity (max {maxIntensity.toFixed(2)})
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}
