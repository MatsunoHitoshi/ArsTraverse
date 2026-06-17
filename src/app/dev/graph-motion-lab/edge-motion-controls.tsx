"use client";

import React, { useMemo } from "react";
import type {
  CustomLinkType,
  CustomNodeType,
} from "@/app/const/types";
import type {
  FloodDiffusionMotionResponse,
  FloodDiffusionSegmentInput,
} from "@/app/const/skeleton-motion";
import { buildConcreteMotionPrompt, buildMotionPromptFromLink } from "@/app/_utils/kg/build-motion-prompt";
import { FloodSegmentEditor } from "@/app/dev/motion-comparison-lab/flood-segment-editor";
import { FloodControlsPanel } from "@/app/dev/motion-comparison-lab/flood-controls-panel";
import { FloodSegmentTimeline } from "@/app/dev/motion-comparison-lab/flood-segment-timeline";
import { FloodLatencyBadge } from "@/app/dev/motion-comparison-lab/flood-latency-badge";
import { MotionIntensityTimeline } from "@/app/dev/motion-comparison-lab/motion-timeline";
import { formatMotionTime } from "@/app/const/skeleton-motion";
import {
  analyzeSkeletonFootTravel,
  MAX_SKELETON_EDGE_TRAVEL_T,
} from "@/app/_utils/kg/skeleton-foot-travel";
import type { GraphMotionPlacement } from "./graph-motion-canvas";
import { DEFAULT_SKELETON_ABOVE_EDGE_LABEL_EXTRA_Y } from "./graph-motion-canvas";

function MetricBar({
  label,
  value,
  maxValue = 1,
  lowerIsBetter = true,
}: {
  label: string;
  value: number;
  maxValue?: number;
  lowerIsBetter?: boolean;
}) {
  const ratio = Math.min(value / maxValue, 1);
  const hue = lowerIsBetter ? (1 - ratio) * 120 : ratio * 120;

  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-400 mb-0.5">
        <span>{label}</span>
        <span>{value.toFixed(4)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-700">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${ratio * 100}%`,
            backgroundColor: `hsl(${hue}, 70%, 50%)`,
          }}
        />
      </div>
    </div>
  );
}

export type EdgeMotionControlsProps = {
  selectedLink: CustomLinkType | null;
  segments: FloodDiffusionSegmentInput[];
  presetId: string;
  onSegmentsChange: (segments: FloodDiffusionSegmentInput[]) => void;
  onPresetChange: (presetId: string) => void;
  smoothingAlpha: number;
  numDenoiseSteps: number | null;
  floodLength: number;
  onSmoothingAlphaChange: (value: number) => void;
  onNumDenoiseStepsChange: (value: number | null) => void;
  onFloodLengthChange: (value: number) => void;
  onGenerate: (forceRegenerate: boolean) => void;
  isLoading: boolean;
  error: string | null;
  motion: FloodDiffusionMotionResponse | null;
  placement: GraphMotionPlacement;
  onPlacementChange: (patch: Partial<GraphMotionPlacement>) => void;
  playback: {
    progress: number;
    isPlaying: boolean;
    loop: boolean;
    togglePlay: () => void;
    setLoop: (loop: boolean) => void;
    scrub: (progress: number) => void;
  };
};

export function EdgeMotionControls({
  selectedLink,
  segments,
  presetId,
  onSegmentsChange,
  onPresetChange,
  smoothingAlpha,
  numDenoiseSteps,
  floodLength,
  onSmoothingAlphaChange,
  onNumDenoiseStepsChange,
  onFloodLengthChange,
  onGenerate,
  isLoading,
  error,
  motion,
  placement,
  onPlacementChange,
  playback,
}: EdgeMotionControlsProps) {
  const suggestedPrompt = useMemo(() => {
    if (!selectedLink) return "";
    const src = selectedLink.source as CustomNodeType;
    const tgt = selectedLink.target as CustomNodeType;
    return buildMotionPromptFromLink({
      type: selectedLink.type,
      source: src,
      target: tgt,
    });
  }, [selectedLink]);

  const concretePrompt = useMemo(() => {
    if (!selectedLink) return "";
    const src = selectedLink.source as CustomNodeType;
    const tgt = selectedLink.target as CustomNodeType;
    return buildConcreteMotionPrompt({
      edgeType: selectedLink.type,
      sourceName: src.name,
      sourceLabel: src.label,
      targetName: tgt.name,
      targetLabel: tgt.label,
    });
  }, [selectedLink]);

  const durationSec = motion
    ? motion.frames.length / motion.fps
    : 0;

  const floodSegmentMeta = motion?.floodMeta.segments;

  const footTravelProfile = useMemo(
    () => (motion ? analyzeSkeletonFootTravel(motion) : null),
    [motion],
  );

  const liveTravelT =
    footTravelProfile && placement.footTravelFromFeet !== false
      ? footTravelProfile.positionTAtProgress(playback.progress)
      : placement.positionT;

  const copySuggestedToFirstSegment = () => {
    if (!suggestedPrompt || segments.length === 0) return;
    const next = segments.map((seg, i) =>
      i === 0 ? { ...seg, text: suggestedPrompt } : seg,
    );
    onSegmentsChange(next);
  };

  if (!selectedLink) {
    return (
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6 text-sm text-gray-400">
        グラフ上のエッジをクリックして選択してください。
      </div>
    );
  }

  const src = selectedLink.source as CustomNodeType;
  const tgt = selectedLink.target as CustomNodeType;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Selected Edge
        </h3>
        <p className="text-sm text-white font-medium">
          {src.name}{" "}
          <span className="text-sky-400">[{selectedLink.type}]</span>{" "}
          {tgt.name}
        </p>
        <p className="text-xs text-gray-500 mt-1 font-mono">{selectedLink.id}</p>
      </div>

      {suggestedPrompt && (
        <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-gray-400 mb-1">
                Prompt suggestion (label抽象化)
              </p>
              <p className="text-sm text-gray-200">{suggestedPrompt}</p>
              {concretePrompt !== suggestedPrompt && (
                <p className="text-xs text-gray-500 mt-1">
                  具体名: {concretePrompt}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={copySuggestedToFirstSegment}
              className="shrink-0 rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
            >
              Copy to seg 1
            </button>
          </div>
        </div>
      )}

      <FloodSegmentEditor
        segments={segments}
        selectedStreamingPresetId={presetId}
        onSegmentsChange={onSegmentsChange}
        onStreamingPresetChange={onPresetChange}
      />

      <FloodControlsPanel
        floodLength={floodLength}
        smoothingAlpha={smoothingAlpha}
        numDenoiseSteps={numDenoiseSteps}
        onFloodLengthChange={onFloodLengthChange}
        onSmoothingAlphaChange={onSmoothingAlphaChange}
        onNumDenoiseStepsChange={onNumDenoiseStepsChange}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onGenerate(false)}
          disabled={isLoading || segments.length === 0}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Generating…" : "Generate Streaming"}
        </button>
        <button
          type="button"
          onClick={() => onGenerate(true)}
          disabled={isLoading || segments.length === 0}
          className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-950/40 disabled:opacity-50"
        >
          Force Regenerate
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {motion?.metrics && (
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              FloodDiffusion Metrics
            </h4>
            {motion.floodMeta && (
              <FloodLatencyBadge inferenceMs={motion.floodMeta.inferenceMs} />
            )}
          </div>
          <MetricBar
            label="Foot Skating Ratio"
            value={motion.metrics.footSkatingRatio}
            maxValue={0.5}
          />
          <MetricBar
            label="Joint Jitter"
            value={motion.metrics.jointJitter}
            maxValue={2}
          />
        </div>
      )}

      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 space-y-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Placement
        </h3>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <label className="block text-xs text-gray-400">
              Position along edge (
              {placement.footTravelFromFeet !== false && !placement.anchorAtEdgeLabel
                ? liveTravelT.toFixed(2)
                : placement.positionT.toFixed(2)}
              )
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={placement.footTravelFromFeet !== false}
                  onChange={(e) =>
                    onPlacementChange({ footTravelFromFeet: e.target.checked })
                  }
                  className="rounded border-gray-600 bg-gray-700"
                />
                足の動きでエッジ移動
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={placement.anchorAtEdgeLabel === true}
                  onChange={(e) =>
                    onPlacementChange({ anchorAtEdgeLabel: e.target.checked })
                  }
                  className="rounded border-gray-600 bg-gray-700"
                />
                エッジ Type ラベル上に固定
              </label>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(placement.positionT * 100)}
            onChange={(e) =>
              onPlacementChange({ positionT: Number(e.target.value) / 100 })
            }
            disabled={
              placement.anchorAtEdgeLabel === true ||
              placement.footTravelFromFeet !== false
            }
            className="w-full accent-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
            <span>source</span>
            <span>mid</span>
            <span>target</span>
          </div>
          {footTravelProfile && placement.footTravelFromFeet !== false && (
            <p className="mt-2 text-[10px] text-gray-500 leading-relaxed">
              足が動いている時間: {(footTravelProfile.footActiveRatio * 100).toFixed(0)}%
              {" · "}
              最大到達: {footTravelProfile.maxTravelT.toFixed(2)}（上限{" "}
              {MAX_SKELETON_EDGE_TRAVEL_T}）
            </p>
          )}
          {placement.anchorAtEdgeLabel && (
            <div className="mt-3">
              <label className="block text-xs text-gray-400 mb-1">
                ラベル上の余白 (
                {(
                  placement.anchorLabelLiftY ??
                  DEFAULT_SKELETON_ABOVE_EDGE_LABEL_EXTRA_Y
                ).toFixed(0)}
                px)
              </label>
              <input
                type="range"
                min={0}
                max={80}
                value={Math.round(
                  placement.anchorLabelLiftY ??
                    DEFAULT_SKELETON_ABOVE_EDGE_LABEL_EXTRA_Y,
                )}
                onChange={(e) =>
                  onPlacementChange({
                    anchorLabelLiftY: Number(e.target.value),
                  })
                }
                className="w-full accent-sky-500"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Opacity ({placement.opacity.toFixed(2)})
          </label>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(placement.opacity * 100)}
            onChange={(e) =>
              onPlacementChange({ opacity: Number(e.target.value) / 100 })
            }
            className="w-full accent-sky-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Scale multiplier ({placement.scaleMultiplier.toFixed(2)})
          </label>
          <input
            type="range"
            min={50}
            max={200}
            value={Math.round(placement.scaleMultiplier * 100)}
            onChange={(e) =>
              onPlacementChange({
                scaleMultiplier: Number(e.target.value) / 100,
              })
            }
            className="w-full accent-sky-500"
          />
        </div>

        <div className="rounded-lg border border-violet-900/40 bg-violet-950/20 p-3 space-y-3">
          <h4 className="text-xs font-semibold text-violet-300 uppercase tracking-wide">
            3D View (edge-aligned)
          </h4>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={placement.alignWithEdge !== false}
              onChange={(e) =>
                onPlacementChange({ alignWithEdge: e.target.checked })
              }
              className="rounded border-gray-600 bg-gray-700"
            />
            エッジの向きに合わせて人体を回転
          </label>
          {!motion?.frames3d && (
            <p className="text-xs text-amber-500/90">
              frames3d なし — 再 Generate で 3D データを取得してください。
            </p>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Camera pitch ({placement.viewPitchDeg ?? 30}°)
            </label>
            <input
              type="range"
              min={0}
              max={45}
              value={placement.viewPitchDeg ?? 30}
              onChange={(e) =>
                onPlacementChange({ viewPitchDeg: Number(e.target.value) })
              }
              className="w-full accent-violet-500"
            />
            <p className="text-[10px] text-gray-500 mt-0.5">
              斜め上からの見下ろし量（大きいほど 3/4 後方ビューに近い）
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Yaw offset ({placement.viewYawOffsetDeg ?? 0}°)
            </label>
            <input
              type="range"
              min={-45}
              max={45}
              value={placement.viewYawOffsetDeg ?? 0}
              onChange={(e) =>
                onPlacementChange({ viewYawOffsetDeg: Number(e.target.value) })
              }
              className="w-full accent-violet-500"
            />
          </div>
        </div>

        {!placement.alignWithEdge && (
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={placement.facesLeft === true}
              onChange={(e) =>
                onPlacementChange({
                  facesLeft: e.target.checked ? true : undefined,
                })
              }
              className="rounded border-gray-600 bg-gray-700"
            />
            Force faces left (2D fallback)
          </label>
        )}
      </div>

      {motion && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={playback.togglePlay}
              className="rounded-lg bg-gray-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-600"
            >
              {playback.isPlaying ? "Pause" : "Play"}
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={playback.loop}
                onChange={(e) => playback.setLoop(e.target.checked)}
                className="rounded border-gray-600 bg-gray-700"
              />
              Loop
            </label>
            <span className="ml-auto text-xs text-gray-400 tabular-nums">
              {formatMotionTime(playback.progress * durationSec)} /{" "}
              {formatMotionTime(durationSec)}
            </span>
          </div>

          {floodSegmentMeta && floodSegmentMeta.length > 0 ? (
            <FloodSegmentTimeline
              segments={floodSegmentMeta}
              totalFrames={motion.frames.length}
              fps={motion.fps}
              progress={playback.progress}
              onScrub={playback.scrub}
            />
          ) : (
            <MotionIntensityTimeline
              label="FloodDiffusion"
              accentColor="#22d3ee"
              motionData={motion}
              progress={playback.progress}
              onScrub={playback.scrub}
            />
          )}
        </div>
      )}
    </div>
  );
}
