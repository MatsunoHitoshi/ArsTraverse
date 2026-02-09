"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { MetaGraphStoryData } from "@/app/_hooks/use-meta-graph-story";
import { StorytellingGraphUnified } from "./storytelling-graph-unified";
import { buildScrollStepsFromMetaGraphStoryData } from "@/app/_utils/story-scroll-utils";
import { getEdgeCompositeKeyFromLink } from "@/app/const/story-segment";
import {
  createSvgToCanvasRenderer,
  type SvgToCanvasRenderer,
} from "@/app/_utils/video/svg-to-canvas";
import { VideoRecorder, downloadBlob, downloadBlobsSequentially } from "@/app/_utils/video/video-recorder";
import {
  runRecording,
  type RecordingConfig,
  type RecordingProgress,
  type RecordingStep,
} from "@/app/_utils/video/recording-sequencer";
import { VideoExportModal } from "../../modal/video-export-modal";

/** 録画用グラフのサイズ（出力解像度）。16:9 の 1280x720 */
const RECORDING_WIDTH = 1280;
const RECORDING_HEIGHT = 720;
const RECORDING_BACKGROUND = "#0F172A";

export interface StorytellingGraphRecorderProps {
  graphDocument: GraphDocumentForFrontend;
  metaGraphData: MetaGraphStoryData;
  workspaceTitle?: string;
}

/**
 * 動画書き出し用のレコーダーコンポーネント。
 * StorytellingGraphUnified を内部にマウントし、
 * セグメントを順次切り替えながらアニメーションを録画する。
 */
export function StorytellingGraphRecorder({
  graphDocument,
  metaGraphData,
  workspaceTitle,
}: StorytellingGraphRecorderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [recordingProgress, setRecordingProgress] =
    useState<RecordingProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // フォーカス状態（録画シーケンサーが書き換える）
  const [focusNodeIds, setFocusNodeIds] = useState<string[]>([]);
  const [focusEdgeIds, setFocusEdgeIds] = useState<string[]>([]);
  const [showFullGraph, setShowFullGraph] = useState(true);

  // 録画設定（モーダルから受け取り、SVG準備完了後に使用する）
  const [recordingConfig, setRecordingConfig] = useState<RecordingConfig | null>(
    null,
  );
  // 録画処理が実行中かどうかのフラグ（二重実行防止）
  const isProcessingRef = useRef(false);

  // SVG ref（StorytellingGraphUnified から取得）
  const svgRef = useRef<SVGSVGElement | null>(null);
  // svgRef.current の変更を検知するためのステート（ref は変更通知がないため）
  const [svgElement, setSvgElement] = useState<SVGSVGElement | null>(null);
  const onSvgRef = useCallback((el: SVGSVGElement | null) => {
    svgRef.current = el;
    setSvgElement(el);
  }, []);

  // 遷移完了通知のための Promise ベースコールバック
  const transitionResolveRef = useRef<(() => void) | null>(null);
  const handleTransitionComplete = useCallback(() => {
    if (transitionResolveRef.current) {
      transitionResolveRef.current();
      transitionResolveRef.current = null;
    }
  }, []);

  const waitForTransitionComplete = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      transitionResolveRef.current = resolve;
    });
  }, []);

  // ステップの構築（オーバービュー + ストーリーステップ）
  const steps = useMemo((): RecordingStep[] => {
    const storySteps = buildScrollStepsFromMetaGraphStoryData(metaGraphData);

    // scroll-storytelling-viewer-unified と同じオーバービューステップを先頭に追加
    const overviewStep: RecordingStep = {
      id: "__overview__",
      communityId: "",
      communityTitle: workspaceTitle ?? "グラフ全体",
      nodeIds: [],
      edgeIds: [],
    };

    // 各ステップの nodeIds/edgeIds を補完（nodeIds が空でコミュニティが指定されている場合はコミュニティのノード全てを含める）
    const enrichedStorySteps: RecordingStep[] = storySteps.map((step) => {
      if (
        step.nodeIds.length === 0 &&
        step.edgeIds.length === 0 &&
        step.communityId &&
        metaGraphData.communityMap
      ) {
        const communityNodeIds = Object.entries(metaGraphData.communityMap)
          .filter(([, cid]) => cid === step.communityId)
          .map(([nodeId]) => nodeId);
        const communityNodeIdSet = new Set(communityNodeIds);
        const communityEdgeIds = (graphDocument?.relationships ?? [])
          .filter(
            (rel) =>
              communityNodeIdSet.has(rel.sourceId) &&
              communityNodeIdSet.has(rel.targetId),
          )
          .map((rel) => getEdgeCompositeKeyFromLink(rel));
        return {
          ...step,
          nodeIds: communityNodeIds,
          edgeIds: communityEdgeIds,
        };
      }
      return step;
    });

    return [overviewStep, ...enrichedStorySteps];
  }, [metaGraphData, workspaceTitle, graphDocument]);

  const communityTitles = useMemo(
    () =>
      Object.fromEntries(
        (metaGraphData.summaries ?? []).map((s) => [s.communityId, s.title]),
      ),
    [metaGraphData.summaries],
  );

  // 実際の録画処理（SVGがマウントされた後に呼ばれる）
  const executeRecording = useCallback(
    async (config: RecordingConfig) => {
      if (!svgRef.current) {
        console.error("SVG 要素が見つかりません");
        setRecordingProgress({
          phase: "error",
          currentTransitionIndex: 0,
          totalTransitions: steps.length - 1,
          overallProgress: 0,
          errorMessage: "SVG要素の取得に失敗しました",
        });
        return;
      }

      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let renderer: SvgToCanvasRenderer | null = null;
      let recorder: VideoRecorder | null = null;

      try {
        renderer = createSvgToCanvasRenderer(
          svgRef.current,
          RECORDING_WIDTH,
          RECORDING_HEIGHT,
          RECORDING_BACKGROUND,
        );
        const canvas = renderer.getCanvas();
        recorder = new VideoRecorder({
          canvas,
          fps: config.fps,
        });

        const createRecorder = () =>
          new VideoRecorder({ canvas, fps: config.fps });

        const result = await runRecording(
          steps,
          config,
          renderer,
          recorder,
          createRecorder,
          {
            setFocus: (nodeIds, edgeIds) => {
              setFocusNodeIds(nodeIds);
              setFocusEdgeIds(edgeIds);
            },
            setShowFullGraph: (show) => {
              setShowFullGraph(show);
            },
            waitForTransitionComplete,
            onProgress: setRecordingProgress,
          },
          abortController.signal,
        );

        if (abortController.signal.aborted) {
          setRecordingProgress(null);
          return;
        }

        // ダウンロード
        if (result.mode === "combined") {
          downloadBlob(result.blob, result.filename);
        } else {
          await downloadBlobsSequentially(result.files);
        }

        setRecordingProgress({
          phase: "done",
          currentTransitionIndex: steps.length - 1,
          totalTransitions: steps.length - 1,
          overallProgress: 1,
        });
      } catch (error) {
        console.error("録画エラー:", error);
        setRecordingProgress({
          phase: "error",
          currentTransitionIndex: 0,
          totalTransitions: steps.length - 1,
          overallProgress: 0,
          errorMessage:
            error instanceof Error ? error.message : "不明なエラー",
        });
      } finally {
        // 正常終了・エラー・中断にかかわらずリソースを解放
        renderer?.dispose();
        recorder?.dispose();
        isProcessingRef.current = false;
        // 完了後は設定をクリア（再実行可能にするため）
        setRecordingConfig(null);
      }
    },
    [steps, waitForTransitionComplete],
  );

  // 録画開始トリガー（モーダルから呼ばれる）
  const handleStartRecording = useCallback(
    async (config: RecordingConfig) => {
      // 1. 設定を保存
      setRecordingConfig(config);
      // 2. プログレスを初期化（これにより isRecording が true になり、グラフがマウントされる）
      setRecordingProgress({
        phase: "recording",
        currentTransitionIndex: 0,
        totalTransitions: steps.length - 1,
        overallProgress: 0,
      });
      // 3. 実際の処理は useEffect で svgRef が有効になったら開始する
    },
    [steps],
  );

  // SVG 要素と設定が揃ったら録画を開始する Effect
  React.useEffect(() => {
    if (
      recordingConfig &&
      svgElement &&
      recordingProgress?.phase === "recording" &&
      !isProcessingRef.current
    ) {
      void executeRecording(recordingConfig);
    }
  }, [recordingConfig, svgElement, recordingProgress?.phase, executeRecording]);

  const handleAbortRecording = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setRecordingProgress(null);
    setRecordingConfig(null);
    isProcessingRef.current = false;
  }, []);

  const isRecording =
    recordingProgress != null && recordingProgress.phase === "recording";

  return (
    <>
      {/* 録画用のグラフ（録画中のみ表示、画面外にオフスクリーン配置） */}
      {isRecording && (
        <div
          style={{
            position: "fixed",
            left: "-9999px",
            top: "-9999px",
            width: RECORDING_WIDTH,
            height: RECORDING_HEIGHT,
            overflow: "hidden",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        >
          <StorytellingGraphUnified
            key="recording-graph"
            graphDocument={graphDocument}
            focusNodeIds={focusNodeIds}
            focusEdgeIds={focusEdgeIds}
            animationProgress={1}
            width={RECORDING_WIDTH}
            height={RECORDING_HEIGHT}
            filter={metaGraphData.filter}
            freeExploreMode={false}
            isPc={true}
            communityMap={metaGraphData.communityMap}
            narrativeFlow={metaGraphData.narrativeFlow}
            showFullGraph={showFullGraph}
            communityTitles={communityTitles}
            onTransitionComplete={handleTransitionComplete}
            onSvgRef={onSvgRef}
            forRecording
          />
        </div>
      )}

      {/* モーダル */}
      <VideoExportModal
        isOpen={isModalOpen}
        setIsOpen={setIsModalOpen}
        totalSteps={steps.length}
        onStartRecording={handleStartRecording}
        recordingProgress={recordingProgress}
        onAbortRecording={handleAbortRecording}
      />

      {/* 外部からモーダルを開くためのトリガー */}
      <RecorderTrigger onOpen={() => setIsModalOpen(true)} />
    </>
  );
}

/** ストーリーボードに埋め込むボタン（外部から open を呼ぶ） */
function RecorderTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
    >
      <VideoIcon />
      <span>動画書き出し</span>
    </button>
  );
}

function VideoIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}
