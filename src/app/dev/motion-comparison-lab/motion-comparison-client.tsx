"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { api } from "@/trpc/react";
import { SkeletonMotionPreview } from "@/app/_components/d3/force/storytelling-graph/components/skeleton-motion-renderer";
import type {
  FloodDiffusionMotionResponse,
  FloodDiffusionSegmentInput,
  SkeletonMotionMetrics,
  SkeletonMotionResponse,
} from "@/app/const/skeleton-motion";
import {
  floodLatentTokensFromFrames,
  floodApproxFramesFromLatentTokens,
} from "@/app/const/skeleton-motion";
import {
  CUSTOM_PRESET_ID,
  FLOOD_STREAMING_PRESETS,
  MOTION_PROMPT_PRESETS,
} from "@/app/const/motion-prompt-presets";
import {
  MotionIntensityTimeline,
  MotionPlaybackControls,
} from "@/app/dev/motion-comparison-lab/motion-timeline";
import { useComparisonMotionPlayback } from "@/app/dev/motion-comparison-lab/use-comparison-motion-playback";
import { MotionCachePanel } from "@/app/dev/motion-comparison-lab/motion-cache-panel";
import { FloodControlsPanel } from "@/app/dev/motion-comparison-lab/flood-controls-panel";
import { FloodSegmentEditor } from "@/app/dev/motion-comparison-lab/flood-segment-editor";
import { FloodSegmentTimeline } from "@/app/dev/motion-comparison-lab/flood-segment-timeline";
import { FloodLatencyBadge } from "@/app/dev/motion-comparison-lab/flood-latency-badge";

type ComparisonResult = {
  momask: SkeletonMotionResponse;
  omnicontrol: SkeletonMotionResponse;
  flooddiffusion?: FloodDiffusionMotionResponse;
};

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

function MetricsPanel({
  metrics,
  modelName,
  extra,
}: {
  metrics?: SkeletonMotionMetrics;
  modelName: string;
  extra?: React.ReactNode;
}) {
  if (!metrics) return null;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          {modelName}
        </h4>
        {extra}
      </div>
      <MetricBar
        label="Foot Skating Ratio"
        value={metrics.footSkatingRatio}
        maxValue={0.5}
      />
      <MetricBar
        label="Joint Jitter"
        value={metrics.jointJitter}
        maxValue={2}
      />
      {metrics.trajectoryAdherence != null && (
        <MetricBar
          label="Trajectory Adherence"
          value={metrics.trajectoryAdherence}
          lowerIsBetter={false}
        />
      )}
      <div className="text-xs text-gray-500 mt-1">
        {metrics.totalFrames} frames
        {metrics.trimmed && metrics.originalFrames != null && (
          <span className="text-gray-600">
            {" "}
            (trimmed from {metrics.originalFrames})
          </span>
        )}
      </div>
    </div>
  );
}

const DEFAULT_PRESET = MOTION_PROMPT_PRESETS[0]!;
const DEFAULT_STREAMING_PRESET = FLOOD_STREAMING_PRESETS[0]!;

export function MotionComparisonLabClient() {
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET.id);
  const [prompt, setPrompt] = useState(DEFAULT_PRESET.prompt);
  const [numFrames, setNumFrames] = useState(60);
  const [floodLength, setFloodLength] = useState(
    floodLatentTokensFromFrames(60),
  );
  const [smoothingAlpha, setSmoothingAlpha] = useState(0.5);
  const [numDenoiseSteps, setNumDenoiseSteps] = useState<number | null>(null);
  const [streamingPresetId, setStreamingPresetId] = useState(
    DEFAULT_STREAMING_PRESET.id,
  );
  const [segments, setSegments] = useState<FloodDiffusionSegmentInput[]>(
    DEFAULT_STREAMING_PRESET.segments,
  );
  const [topicSpaceId] = useState("comparison-lab");
  const [edgeId] = useState("lab-edge-001");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [streamingResult, setStreamingResult] =
    useState<FloodDiffusionMotionResponse | null>(null);
  const [loadingCachePrompt, setLoadingCachePrompt] = useState<string | null>(
    null,
  );

  const utils = api.useUtils();

  const comparisonMutation = api.kg.generateMotionComparison.useMutation({
    onSuccess: (data) => {
      setResult(data as ComparisonResult);
      void utils.kg.listSkeletonMotionCache.invalidate({
        topicSpaceId,
        edgeId,
      });
    },
  });

  const streamingMutation = api.kg.generateFloodDiffusion.useMutation({
    onSuccess: (data) => {
      setStreamingResult(data);
      void utils.kg.listSkeletonMotionCache.invalidate({
        topicSpaceId,
        edgeId,
      });
    },
  });

  const handleLoadFromCache = useCallback(
    async (promptText: string, frames: number) => {
      setLoadingCachePrompt(promptText);
      try {
        const data = await utils.kg.getMotionComparisonFromCache.fetch({
          topicSpaceId,
          edgeId,
          promptText,
          numFrames: frames,
        });
        if (!data) return;
        setResult(data as ComparisonResult);
        setStreamingResult(null);
        setPrompt(promptText);
        setNumFrames(frames);
        setFloodLength(floodLatentTokensFromFrames(frames));
        const matching = MOTION_PROMPT_PRESETS.find(
          (p) => p.prompt === promptText,
        );
        setSelectedPresetId(matching?.id ?? CUSTOM_PRESET_ID);
      } finally {
        setLoadingCachePrompt(null);
      }
    },
    [utils, topicSpaceId, edgeId],
  );

  const handlePresetChange = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    if (presetId === CUSTOM_PRESET_ID) return;

    const preset = MOTION_PROMPT_PRESETS.find((p) => p.id === presetId);
    if (preset) setPrompt(preset.prompt);
  }, []);

  const handlePromptChange = useCallback((text: string) => {
    setPrompt(text);
    const matching = MOTION_PROMPT_PRESETS.find((p) => p.prompt === text);
    setSelectedPresetId(matching?.id ?? CUSTOM_PRESET_ID);
  }, []);

  const handleNumFramesChange = useCallback((frames: number) => {
    setNumFrames(frames);
    setFloodLength(floodLatentTokensFromFrames(frames));
  }, []);

  const handleGenerateCompare = useCallback(
    (forceRegenerate = false) => {
      comparisonMutation.mutate({
        topicSpaceId,
        edgeId,
        text: prompt,
        numFrames,
        forceRegenerate,
        floodLength,
        floodSmoothingAlpha: smoothingAlpha,
        floodNumDenoiseSteps: numDenoiseSteps ?? undefined,
      });
    },
    [
      comparisonMutation,
      topicSpaceId,
      edgeId,
      prompt,
      numFrames,
      floodLength,
      smoothingAlpha,
      numDenoiseSteps,
    ],
  );

  const handleGenerateStreaming = useCallback(
    (forceRegenerate = false) => {
      streamingMutation.mutate({
        topicSpaceId,
        edgeId,
        mode: "streaming",
        segments,
        smoothingAlpha,
        numDenoiseSteps: numDenoiseSteps ?? undefined,
        forceRegenerate,
      });
    },
    [
      streamingMutation,
      topicSpaceId,
      edgeId,
      segments,
      smoothingAlpha,
      numDenoiseSteps,
    ],
  );

  const floodDisplay =
    streamingResult ?? result?.flooddiffusion ?? null;

  const momaskDurationMs = useMemo(() => {
    if (!result) return 0;
    return (result.momask.frames.length / result.momask.fps) * 1000;
  }, [result]);

  const omnicontrolDurationMs = useMemo(() => {
    if (!result) return 0;
    return (result.omnicontrol.frames.length / result.omnicontrol.fps) * 1000;
  }, [result]);

  const flooddiffusionDurationMs = useMemo(() => {
    if (!floodDisplay) return 0;
    return (floodDisplay.frames.length / floodDisplay.fps) * 1000;
  }, [floodDisplay]);

  const playback = useComparisonMotionPlayback({
    momaskDurationMs,
    omnicontrolDurationMs,
    flooddiffusionDurationMs,
    autoPlay: true,
  });

  useEffect(() => {
    if (!result && !streamingResult) return;
    playback.reset();
    playback.setIsPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when new motion loads
  }, [result, streamingResult]);

  const handleLoadFromCacheWithPlayback = useCallback(
    async (promptText: string, frames: number) => {
      await handleLoadFromCache(promptText, frames);
      playback.reset();
    },
    [handleLoadFromCache, playback],
  );

  const isLoading =
    comparisonMutation.isPending || streamingMutation.isPending;

  const floodSegmentMeta = floodDisplay?.floodMeta.segments;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Motion Comparison Lab</h1>
        <p className="text-sm text-gray-400 mb-6">
          MoMask / OmniControl / FloodDiffusion
        </p>

        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 mb-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Preset
            </label>
            <select
              value={selectedPresetId}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {MOTION_PROMPT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value={CUSTOM_PRESET_ID}>カスタム入力</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Motion Prompt (MoMask / Omni / Flood single)
            </label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              placeholder="a person walks forward"
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Frames (MoMask)
              </label>
              <input
                type="number"
                value={numFrames}
                onChange={(e) =>
                  handleNumFramesChange(
                    Math.max(10, Math.min(300, Number(e.target.value))),
                  )
                }
                className="w-24 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                min={10}
                max={300}
              />
              <p className="mt-1 text-xs text-gray-500">
                OmniControl: 196f 固定 · Flood single: ≈
                {floodApproxFramesFromLatentTokens(floodLength)}f
              </p>
            </div>

            <button
              onClick={() => handleGenerateCompare(false)}
              disabled={isLoading || !prompt.trim()}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {comparisonMutation.isPending
                ? "Generating..."
                : "Generate & Compare"}
            </button>

            <button
              onClick={() => handleGenerateCompare(true)}
              disabled={isLoading || !prompt.trim()}
              className="rounded-lg border border-orange-500/60 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-300 hover:bg-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Regenerate
            </button>
          </div>

          <FloodControlsPanel
            floodLength={floodLength}
            smoothingAlpha={smoothingAlpha}
            numDenoiseSteps={numDenoiseSteps}
            onFloodLengthChange={setFloodLength}
            onSmoothingAlphaChange={setSmoothingAlpha}
            onNumDenoiseStepsChange={setNumDenoiseSteps}
          />

          <FloodSegmentEditor
            segments={segments}
            selectedStreamingPresetId={streamingPresetId}
            onSegmentsChange={setSegments}
            onStreamingPresetChange={setStreamingPresetId}
          />

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleGenerateStreaming(false)}
              disabled={isLoading || segments.length === 0}
              className="rounded-lg bg-cyan-700 px-5 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {streamingMutation.isPending
                ? "Streaming..."
                : "Generate Streaming (Flood only)"}
            </button>
            <button
              onClick={() => handleGenerateStreaming(true)}
              disabled={isLoading || segments.length === 0}
              className="rounded-lg border border-cyan-600/50 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Regenerate Streaming
            </button>
          </div>

          <p className="text-xs text-gray-500">
            尺はモデル仕様により異なります。FloodDiffusion のストリーミングは
            text_end によるマルチプロンプト切替を体験できます。
          </p>

          {(comparisonMutation.isError || streamingMutation.isError) && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">
              {comparisonMutation.error?.message ??
                streamingMutation.error?.message}
            </div>
          )}
        </div>

        <MotionCachePanel
          topicSpaceId={topicSpaceId}
          edgeId={edgeId}
          activePrompt={prompt}
          loadingPrompt={loadingCachePrompt}
          onLoadComparison={handleLoadFromCacheWithPlayback}
        />

        {(result ?? floodDisplay) && (
          <>
            <div className="mb-4">
              <MotionPlaybackControls
                isPlaying={playback.isPlaying}
                loop={playback.loop}
                onTogglePlay={playback.togglePlay}
                onLoopChange={playback.setLoop}
                momaskDurationSec={momaskDurationMs / 1000}
                omnicontrolDurationSec={omnicontrolDurationMs / 1000}
                flooddiffusionDurationSec={flooddiffusionDurationMs / 1000}
                momaskProgress={playback.momaskProgress}
                omnicontrolProgress={playback.omnicontrolProgress}
                flooddiffusionProgress={playback.flooddiffusionProgress}
              />
            </div>

            {result && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="rounded-xl border border-gray-700 bg-gray-800/30 p-4">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                    MoMask
                  </h3>
                  <div className="flex justify-center mb-4">
                    <SkeletonMotionPreview
                      motionData={result.momask}
                      width={280}
                      height={280}
                      boneColor="rgba(52, 211, 153, 0.85)"
                      jointColor="rgba(110, 231, 183, 0.95)"
                      playbackProgress={playback.momaskProgress}
                      loopCrossfade={playback.loop}
                    />
                  </div>
                  <div className="mb-4">
                    <MotionIntensityTimeline
                      label="MoMask intensity"
                      accentColor="rgb(52, 211, 153)"
                      motionData={result.momask}
                      progress={playback.momaskProgress}
                      onScrub={(p) => {
                        playback.scrubMomask(p);
                        playback.setIsPlaying(false);
                      }}
                    />
                  </div>
                  <MetricsPanel
                    metrics={result.momask.metrics}
                    modelName="MoMask"
                  />
                </div>

                <div className="rounded-xl border border-gray-700 bg-gray-800/30 p-4">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-violet-400" />
                    OmniControl
                  </h3>
                  <div className="flex justify-center mb-4">
                    <SkeletonMotionPreview
                      motionData={result.omnicontrol}
                      width={280}
                      height={280}
                      boneColor="rgba(167, 139, 250, 0.85)"
                      jointColor="rgba(196, 181, 253, 0.95)"
                      playbackProgress={playback.omnicontrolProgress}
                      loopCrossfade={playback.loop}
                    />
                  </div>
                  <div className="mb-4">
                    <MotionIntensityTimeline
                      label="OmniControl intensity"
                      accentColor="rgb(167, 139, 250)"
                      motionData={result.omnicontrol}
                      progress={playback.omnicontrolProgress}
                      onScrub={(p) => {
                        playback.scrubOmnicontrol(p);
                        playback.setIsPlaying(false);
                      }}
                    />
                  </div>
                  <MetricsPanel
                    metrics={result.omnicontrol.metrics}
                    modelName="OmniControl"
                  />
                </div>
              </div>
            )}

            {floodDisplay && (
              <div className="rounded-xl border border-cyan-800/50 bg-cyan-950/10 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-cyan-400" />
                    FloodDiffusion
                  </h3>
                  <span className="text-xs rounded-full bg-cyan-500/15 text-cyan-300 px-2 py-0.5">
                    {floodDisplay.floodMeta.mode}
                  </span>
                  {floodDisplay.floodMeta.inferenceMs != null && (
                    <FloodLatencyBadge
                      inferenceMs={floodDisplay.floodMeta.inferenceMs}
                    />
                  )}
                </div>

                <div className="flex justify-center mb-4">
                  <SkeletonMotionPreview
                    motionData={floodDisplay}
                    width={320}
                    height={320}
                    boneColor="rgba(34, 211, 238, 0.85)"
                    jointColor="rgba(103, 232, 249, 0.95)"
                    playbackProgress={playback.flooddiffusionProgress}
                    loopCrossfade={playback.loop}
                  />
                </div>

                {floodSegmentMeta && floodSegmentMeta.length > 0 ? (
                  <div className="mb-4">
                    <FloodSegmentTimeline
                      segments={floodSegmentMeta}
                      totalFrames={floodDisplay.frames.length}
                      fps={floodDisplay.fps}
                      progress={playback.flooddiffusionProgress}
                      onScrub={(p) => {
                        playback.scrubFlooddiffusion(p);
                        playback.setIsPlaying(false);
                      }}
                    />
                  </div>
                ) : (
                  <div className="mb-4">
                    <MotionIntensityTimeline
                      label="FloodDiffusion intensity"
                      accentColor="rgb(34, 211, 238)"
                      motionData={floodDisplay}
                      progress={playback.flooddiffusionProgress}
                      onScrub={(p) => {
                        playback.scrubFlooddiffusion(p);
                        playback.setIsPlaying(false);
                      }}
                    />
                  </div>
                )}

                <MetricsPanel
                  metrics={floodDisplay.metrics}
                  modelName="FloodDiffusion"
                  extra={
                    <span className="text-[10px] text-gray-500 tabular-nums">
                      {floodDisplay.floodMeta.latentTokens} tokens
                    </span>
                  }
                />
              </div>
            )}
          </>
        )}

        {!result && !floodDisplay && !isLoading && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg mb-2">No motions generated yet</p>
            <p className="text-sm">
              Enter a prompt and click Generate & Compare or Generate Streaming
            </p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-20">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="mt-4 text-gray-400">Generating motions on GPU...</p>
          </div>
        )}
      </div>
    </div>
  );
}
