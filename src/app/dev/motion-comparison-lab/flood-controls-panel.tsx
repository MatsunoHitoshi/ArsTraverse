"use client";

import React from "react";
import {
  FLOOD_LATENT_TO_FRAME_RATIO,
  floodApproxFramesFromLatentTokens,
  formatMotionTime,
} from "@/app/const/skeleton-motion";

type FloodControlsPanelProps = {
  floodLength: number;
  smoothingAlpha: number;
  numDenoiseSteps: number | null;
  onFloodLengthChange: (value: number) => void;
  onSmoothingAlphaChange: (value: number) => void;
  onNumDenoiseStepsChange: (value: number | null) => void;
};

export function FloodControlsPanel({
  floodLength,
  smoothingAlpha,
  numDenoiseSteps,
  onFloodLengthChange,
  onSmoothingAlphaChange,
  onNumDenoiseStepsChange,
}: FloodControlsPanelProps) {
  const approxFrames = floodApproxFramesFromLatentTokens(floodLength);
  const approxSec = approxFrames / 20;

  return (
    <div className="rounded-lg border border-cyan-800/40 bg-cyan-950/20 p-3">
      <h4 className="text-xs font-semibold text-cyan-300 mb-3 uppercase tracking-wide">
        FloodDiffusion Controls
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Latent tokens (single)
          </label>
          <input
            type="number"
            min={5}
            max={120}
            value={floodLength}
            onChange={(e) =>
              onFloodLengthChange(
                Math.max(5, Math.min(120, Number(e.target.value))),
              )
            }
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white"
          />
          <p className="mt-1 text-[10px] text-gray-500">
            ≈ {approxFrames} frames ({formatMotionTime(approxSec)}) · ×
            {FLOOD_LATENT_TO_FRAME_RATIO} upsample
          </p>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Smoothing α ({smoothingAlpha.toFixed(2)})
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(smoothingAlpha * 100)}
            onChange={(e) => onSmoothingAlphaChange(Number(e.target.value) / 100)}
            className="w-full accent-cyan-400"
          />
          <p className="mt-1 text-[10px] text-gray-500">
            低いほど関節位置が滑らか
          </p>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Denoise steps (optional)
          </label>
          <input
            type="number"
            min={5}
            max={100}
            placeholder="default"
            value={numDenoiseSteps ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              onNumDenoiseStepsChange(raw === "" ? null : Number(raw));
            }}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white"
          />
        </div>
      </div>
    </div>
  );
}
