/**
 * 録画シーケンサー。
 * steps 配列をもとにセグメントを順次切り替え、
 * 各フレームで SVG→Canvas ラスタライズ＋MediaRecorder 録画を駆動する。
 */

import type { SvgToCanvasRenderer } from "./svg-to-canvas";
import type { VideoRecorder } from "./video-recorder";

/** 録画の設定 */
export interface RecordingConfig {
  mode: "individual" | "combined";
  fps: number;
  /** セグメント個別モード用: 遷移前の静止時間 (ms) */
  holdBeforeMs: number;
  /** セグメント個別モード用: 遷移後の静止時間 (ms) */
  holdAfterMs: number;
  /** 全体統合モード用: 最初のセグメントの表示時間 (ms) */
  holdFirstMs: number;
  /** 全体統合モード用: セグメント間の滞留時間 (ms) */
  holdBetweenMs: number;
  /** 全体統合モード用: 最後のセグメントの表示時間 (ms) */
  holdLastMs: number;
}

export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  mode: "combined",
  fps: 30,
  holdBeforeMs: 500,
  holdAfterMs: 1000,
  holdBetweenMs: 2000,
  holdFirstMs: 2000,
  holdLastMs: 2000,
};

/** 録画の進行状態 */
export interface RecordingProgress {
  phase: "idle" | "recording" | "done" | "error";
  /** 現在処理中のセグメント遷移インデックス（0-based） */
  currentTransitionIndex: number;
  /** 遷移の総数 */
  totalTransitions: number;
  /** 0-1 の全体進捗 */
  overallProgress: number;
  /** エラーメッセージ（phase === "error" 時） */
  errorMessage?: string;
}

/** 録画結果 */
export type RecordingResult =
  | { mode: "combined"; blob: Blob; filename: string }
  | {
      mode: "individual";
      files: Array<{ blob: Blob; filename: string; segmentIndex: number }>;
    };

/** ステップ（セグメント）の情報。scroll-storytelling-viewer のステップと同じ構造 */
export interface RecordingStep {
  id: string;
  communityId: string;
  communityTitle?: string;
  nodeIds: string[];
  edgeIds: string[];
}

/** シーケンサーが外部（Recorder コンポーネント）と通信するためのコールバック */
export interface SequencerCallbacks {
  /** フォーカスを切り替える（StorytellingGraphUnified の props を更新） */
  setFocus: (nodeIds: string[], edgeIds: string[]) => void;
  /** showFullGraph を切り替える */
  setShowFullGraph: (show: boolean) => void;
  /** 遷移完了を待つ Promise を返す（onTransitionComplete が呼ばれるまで待つ） */
  waitForTransitionComplete: () => Promise<void>;
  /** 進捗を通知する */
  onProgress: (progress: RecordingProgress) => void;
}

/**
 * 指定 ms だけ待つ間、毎フレーム Canvas にレンダリングし続ける。
 * MediaRecorder は captureStream から自動でフレームを取得するため、
 * Canvas の内容が変わるたびに新しいフレームが記録される。
 */
async function holdAndRender(
  renderer: SvgToCanvasRenderer,
  durationMs: number,
  abortSignal: AbortSignal,
): Promise<void> {
  const startTime = performance.now();
  while (performance.now() - startTime < durationMs) {
    if (abortSignal.aborted) return;
    await renderer.renderFrame();
    // 次のアニメーションフレームまで待つ
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

/**
 * 遷移アニメーション中、毎フレーム Canvas にレンダリングし続ける。
 * 遷移完了を外部から通知されるまでループする。
 */
async function renderDuringTransition(
  renderer: SvgToCanvasRenderer,
  waitForComplete: () => Promise<void>,
  abortSignal: AbortSignal,
): Promise<void> {
  // 遷移完了を待つ Promise と、レンダリングループを並行実行
  let transitionDone = false;
  const transitionPromise = waitForComplete().then(() => {
    transitionDone = true;
  });

  // 遷移中は毎フレーム Canvas を更新
  while (!transitionDone && !abortSignal.aborted) {
    await renderer.renderFrame();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  // 遷移完了後、最終フレームを確実に描画
  if (!abortSignal.aborted) {
    await renderer.renderFrame();
  }

  await transitionPromise;
}

/** 全体統合モード（combined）で録画を実行する */
async function runCombined(
  steps: RecordingStep[],
  config: RecordingConfig,
  renderer: SvgToCanvasRenderer,
  recorder: VideoRecorder,
  callbacks: SequencerCallbacks,
  abortSignal: AbortSignal,
): Promise<RecordingResult> {
  const totalTransitions = steps.length - 1;

  // 最初のステップをセット
  const firstStep = steps[0]!;
  const isOverview = firstStep.id === "__overview__";
  if (isOverview) {
    callbacks.setShowFullGraph(true);
    callbacks.setFocus([], []);
  } else {
    callbacks.setShowFullGraph(false);
    callbacks.setFocus(firstStep.nodeIds, firstStep.edgeIds);
  }

  // レイアウト安定待ち
  await new Promise((r) => setTimeout(r, 300));

  recorder.start();

  // 最初のセグメントの静止（初期状態を見せる）
  callbacks.onProgress({
    phase: "recording",
    currentTransitionIndex: 0,
    totalTransitions,
    overallProgress: 0,
  });
  await holdAndRender(renderer, config.holdFirstMs, abortSignal);
  if (abortSignal.aborted) {
    return { mode: "combined", blob: await recorder.stop(), filename: "" };
  }

  // 各遷移を実行
  for (let i = 0; i < totalTransitions; i++) {
    if (abortSignal.aborted) break;

    const nextStep = steps[i + 1]!;
    const isNextOverview = nextStep.id === "__overview__";

    callbacks.onProgress({
      phase: "recording",
      currentTransitionIndex: i,
      totalTransitions,
      overallProgress: (i + 0.5) / totalTransitions,
    });

    // フォーカスを次のステップに切り替え → 遷移アニメーション開始
    if (isNextOverview) {
      callbacks.setShowFullGraph(true);
      callbacks.setFocus([], []);
    } else {
      callbacks.setShowFullGraph(false);
      callbacks.setFocus(nextStep.nodeIds, nextStep.edgeIds);
    }

    // 遷移アニメーション中はフレームをキャプチャし続ける
    await renderDuringTransition(
      renderer,
      callbacks.waitForTransitionComplete,
      abortSignal,
    );
    if (abortSignal.aborted) break;

    // 遷移後の滞留
    const holdMs =
      i === totalTransitions - 1 ? config.holdLastMs : config.holdBetweenMs;
    await holdAndRender(renderer, holdMs, abortSignal);
  }

  const blob = await recorder.stop();
  callbacks.onProgress({
    phase: "done",
    currentTransitionIndex: totalTransitions,
    totalTransitions,
    overallProgress: 1,
  });

  return {
    mode: "combined",
    blob,
    filename: `story-animation-${Date.now()}.webm`,
  };
}

/** セグメント個別モード（individual）で録画を実行する */
async function runIndividual(
  steps: RecordingStep[],
  config: RecordingConfig,
  renderer: SvgToCanvasRenderer,
  createRecorder: () => VideoRecorder,
  callbacks: SequencerCallbacks,
  abortSignal: AbortSignal,
): Promise<RecordingResult> {
  const totalTransitions = steps.length - 1;
  const files: Array<{ blob: Blob; filename: string; segmentIndex: number }> =
    [];

  for (let i = 0; i < totalTransitions; i++) {
    if (abortSignal.aborted) break;

    callbacks.onProgress({
      phase: "recording",
      currentTransitionIndex: i,
      totalTransitions,
      overallProgress: i / totalTransitions,
    });

    const currentStep = steps[i]!;
    const nextStep = steps[i + 1]!;
    const isCurrentOverview = currentStep.id === "__overview__";
    const isNextOverview = nextStep.id === "__overview__";

    // 遷移前の状態をセット
    if (isCurrentOverview) {
      callbacks.setShowFullGraph(true);
      callbacks.setFocus([], []);
    } else {
      callbacks.setShowFullGraph(false);
      callbacks.setFocus(currentStep.nodeIds, currentStep.edgeIds);
    }

    // レイアウト安定待ち
    await new Promise((r) => setTimeout(r, 300));

    // 録画開始（セグメントごとに新しい recorder を使う）
    const recorder = createRecorder();
    recorder.start();

    // 遷移前の静止
    await holdAndRender(renderer, config.holdBeforeMs, abortSignal);
    if (abortSignal.aborted) {
      recorder.dispose();
      break;
    }

    // フォーカスを次のステップに切り替え → 遷移アニメーション
    if (isNextOverview) {
      callbacks.setShowFullGraph(true);
      callbacks.setFocus([], []);
    } else {
      callbacks.setShowFullGraph(false);
      callbacks.setFocus(nextStep.nodeIds, nextStep.edgeIds);
    }

    await renderDuringTransition(
      renderer,
      callbacks.waitForTransitionComplete,
      abortSignal,
    );
    if (abortSignal.aborted) {
      recorder.dispose();
      break;
    }

    // 遷移後の静止
    await holdAndRender(renderer, config.holdAfterMs, abortSignal);

    const blob = await recorder.stop();
    recorder.dispose();

    const segLabel = String(i).padStart(2, "0");
    files.push({
      blob,
      filename: `segment-${segLabel}-to-${String(i + 1).padStart(2, "0")}.webm`,
      segmentIndex: i,
    });

    callbacks.onProgress({
      phase: "recording",
      currentTransitionIndex: i + 1,
      totalTransitions,
      overallProgress: (i + 1) / totalTransitions,
    });
  }

  callbacks.onProgress({
    phase: "done",
    currentTransitionIndex: totalTransitions,
    totalTransitions,
    overallProgress: 1,
  });

  return { mode: "individual", files };
}

/**
 * 録画を実行する。
 * @param steps ストーリーのステップ配列
 * @param config 録画設定
 * @param renderer SVG→Canvas レンダラー
 * @param recorder MediaRecorder ラッパー（combined モードで使用）
 * @param createRecorder recorder のファクトリ（individual モードで使用）
 * @param callbacks 外部通信用コールバック
 * @param abortSignal 中断用シグナル
 */
export async function runRecording(
  steps: RecordingStep[],
  config: RecordingConfig,
  renderer: SvgToCanvasRenderer,
  recorder: VideoRecorder,
  createRecorder: () => VideoRecorder,
  callbacks: SequencerCallbacks,
  abortSignal: AbortSignal,
): Promise<RecordingResult> {
  if (steps.length < 2) {
    throw new Error("録画するには2つ以上のステップが必要です");
  }

  if (config.mode === "combined") {
    return runCombined(
      steps,
      config,
      renderer,
      recorder,
      callbacks,
      abortSignal,
    );
  } else {
    return runIndividual(
      steps,
      config,
      renderer,
      createRecorder,
      callbacks,
      abortSignal,
    );
  }
}
