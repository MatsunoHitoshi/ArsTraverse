"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";
import { useMotionPlayback } from "@/app/dev/motion-comparison-lab/use-motion-playback";
import {
  DEFAULT_SAMPLE_GRAPH_ID,
  getSampleGraphById,
  SAMPLE_GRAPHS,
  type SampleGraphId,
} from "./sample-graphs";
import {
  GraphMotionCanvas,
  DEFAULT_SKELETON_ABOVE_EDGE_LABEL_EXTRA_Y,
  type GraphMotionPlacement,
} from "./graph-motion-canvas";
import { useFloodEdgeMotion } from "./use-flood-edge-motion";
import { EdgeMotionControls } from "./edge-motion-controls";
import { SkeletonMotion3DPreview } from "./lazy-skeleton-3d-preview";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

type PreviewTab = "graph" | "3d";

const DEFAULT_PLACEMENT: GraphMotionPlacement = {
  positionT: 0,
  opacity: 1,
  scaleMultiplier: 1.5,
  anchorAtEdgeLabel: false,
  footTravelFromFeet: true,
  anchorLabelLiftY: DEFAULT_SKELETON_ABOVE_EDGE_LABEL_EXTRA_Y,
  alignWithEdge: true,
  viewPitchDeg: 30,
  viewYawOffsetDeg: 0,
};

export function GraphMotionLabClient() {
  const [sampleGraphId, setSampleGraphId] =
    useState<SampleGraphId>(DEFAULT_SAMPLE_GRAPH_ID);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [placement, setPlacement] =
    useState<GraphMotionPlacement>(DEFAULT_PLACEMENT);
  const [smoothingAlpha, setSmoothingAlpha] = useState(0.5);
  const [numDenoiseSteps, setNumDenoiseSteps] = useState<number | null>(null);
  const [floodLength, setFloodLength] = useState(60);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("graph");

  const sample = getSampleGraphById(sampleGraphId);
  const graph = sample.graph;

  const flood = useFloodEdgeMotion();

  const links = useMemo((): CustomLinkType[] => {
    const nodes = graph.nodes as CustomNodeType[];
    return graph.relationships
      .map((rel) => {
        const source = getNodeByIdForFrontend(rel.sourceId, nodes);
        const target = getNodeByIdForFrontend(rel.targetId, nodes);
        if (!source || !target) return null;
        return { ...rel, source, target };
      })
      .filter((link): link is NonNullable<typeof link> => link != null) as CustomLinkType[];
  }, [graph]);

  const selectedLink = useMemo(
    () => links.find((l) => l.id === selectedEdgeId) ?? null,
    [links, selectedEdgeId],
  );

  const motion = flood.getMotion(selectedEdgeId);
  const segments = flood.getSegments(selectedEdgeId);
  const presetId = flood.getPresetId(selectedEdgeId);

  const durationMs = useMemo(() => {
    if (!motion) return 0;
    return (motion.frames.length / motion.fps) * 1000;
  }, [motion]);

  const playback = useMotionPlayback({
    masterDurationMs: durationMs,
    autoPlay: false,
  });
  const { reset: resetPlayback, setIsPlaying: setPlaybackPlaying } = playback;

  useEffect(() => {
    if (!motion) return;
    resetPlayback();
    setPlaybackPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when new motion loads
  }, [motion]);

  const handleSampleGraphChange = useCallback((id: SampleGraphId) => {
    setSampleGraphId(id);
    setSelectedEdgeId(null);
    setPlacement(DEFAULT_PLACEMENT);
  }, []);

  const handleSelectEdge = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
    resetPlayback();
    setPlaybackPlaying(false);
  }, [resetPlayback, setPlaybackPlaying]);

  const handlePlacementChange = useCallback(
    (patch: Partial<GraphMotionPlacement>) => {
      setPlacement((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const handleGenerate = useCallback(
    (forceRegenerate: boolean) => {
      if (!selectedEdgeId) return;
      flood.generate(selectedEdgeId, {
        segments,
        smoothingAlpha,
        numDenoiseSteps,
        forceRegenerate,
      });
    },
    [flood, selectedEdgeId, segments, smoothingAlpha, numDenoiseSteps],
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-900 text-white">
      <header className="shrink-0 border-b border-gray-800 px-6 py-4">
        <div className="max-w-[1600px]">
          <h1 className="text-2xl font-bold mb-1">Graph Motion Lab</h1>
          <p className="text-sm text-gray-400 mb-1">
            サンプル知識グラフ上で FloodDiffusion streaming
            モーションをエッジに載せ、配置・同期を調整する dev ページです。
          </p>
          <p className="text-xs text-gray-500">
            エッジをクリックして選択 → セグメントを編集 → Generate Streaming。
            ストーリーテリング本番適用前のチューニング用。
            {" "}
            <Link
              href="/dev/motion-comparison-lab"
              className="text-cyan-400 hover:underline"
            >
              Motion Comparison Lab
            </Link>
            {" "}
            へ
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left: preview — fixed, no scroll */}
        <aside className="flex shrink-0 flex-col border-b border-gray-800 p-6 lg:w-[688px] lg:border-b-0 lg:border-r">
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-700 bg-gray-800/50 p-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Sample graph
              </label>
              <select
                value={sampleGraphId}
                onChange={(e) =>
                  handleSampleGraphChange(e.target.value as SampleGraphId)
                }
                className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white"
              >
                {SAMPLE_GRAPHS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500 max-w-md">{sample.description}</p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div
              className="flex w-full max-w-[640px] rounded-lg border border-gray-700 bg-gray-800/50 p-1"
              role="tablist"
              aria-label="プレビュー表示"
            >
              <button
                type="button"
                role="tab"
                aria-selected={previewTab === "graph"}
                onClick={() => setPreviewTab("graph")}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  previewTab === "graph"
                    ? "bg-gray-700 text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                グラフ
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={previewTab === "3d"}
                onClick={() => setPreviewTab("3d")}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  previewTab === "3d"
                    ? "bg-violet-900/60 text-violet-100 shadow-sm"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                3D
              </button>
            </div>

            <div className="w-full max-w-[640px] min-h-[480px]">
              <div className={previewTab === "graph" ? "flex justify-center" : "hidden"}>
                <GraphMotionCanvas
                  graph={graph}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  selectedEdgeId={selectedEdgeId}
                  onSelectEdge={handleSelectEdge}
                  motionData={motion}
                  playbackProgress={motion ? playback.progress : undefined}
                  placement={placement}
                />
              </div>

              <div
                className={
                  previewTab === "3d" ? "flex flex-col items-center" : "hidden"
                }
              >
                <SkeletonMotion3DPreview
                  motionData={motion}
                  playbackProgress={motion ? playback.progress : undefined}
                  loopCrossfade={false}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center max-w-[640px]">
              {previewTab === "graph" ? (
                <>
                  エッジをクリックしてモーション対象を選択。ノードはドラッグで位置調整できます。
                </>
              ) : (
                <>
                  3D プレビューは再生と同期します（+Z=前、+Y=上）。ドラッグでカメラを回転できます。
                </>
              )}
            </p>
          </div>
        </aside>

        {/* Right: controls — independent scroll */}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          <div className="max-w-2xl">
            <EdgeMotionControls
              selectedLink={selectedLink}
              segments={segments}
              presetId={presetId}
              onSegmentsChange={(next) => {
                if (!selectedEdgeId) return;
                flood.setSegments(selectedEdgeId, next);
              }}
              onPresetChange={(id) => {
                if (!selectedEdgeId) return;
                flood.setPresetId(selectedEdgeId, id);
              }}
              smoothingAlpha={smoothingAlpha}
              numDenoiseSteps={numDenoiseSteps}
              floodLength={floodLength}
              onSmoothingAlphaChange={setSmoothingAlpha}
              onNumDenoiseStepsChange={setNumDenoiseSteps}
              onFloodLengthChange={(v) => {
                setFloodLength(v);
              }}
              onGenerate={handleGenerate}
              isLoading={flood.isLoading}
              error={flood.error}
              motion={motion}
              placement={placement}
              onPlacementChange={handlePlacementChange}
              playback={{
                progress: playback.progress,
                isPlaying: playback.isPlaying,
                loop: playback.loop,
                togglePlay: playback.togglePlay,
                setLoop: playback.setLoop,
                scrub: playback.scrub,
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
