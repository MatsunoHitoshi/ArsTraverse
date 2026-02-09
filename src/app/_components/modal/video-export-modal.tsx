"use client";

import React, { useState, useCallback } from "react";
import { Modal } from "./modal";
import { Button } from "../button/button";
import type {
  RecordingConfig,
  RecordingProgress,
} from "@/app/_utils/video/recording-sequencer";
import { DEFAULT_RECORDING_CONFIG } from "@/app/_utils/video/recording-sequencer";

export interface VideoExportModalProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** セグメントの総数（ステップ数。遷移数は totalSteps - 1） */
  totalSteps: number;
  /** 書き出し開始時に呼ばれるコールバック */
  onStartRecording: (config: RecordingConfig) => void;
  /** 録画の進行状態 */
  recordingProgress: RecordingProgress | null;
  /** 録画中断 */
  onAbortRecording?: () => void;
}

export function VideoExportModal({
  isOpen,
  setIsOpen,
  totalSteps,
  onStartRecording,
  recordingProgress,
  onAbortRecording,
}: VideoExportModalProps) {
  const [mode, setMode] = useState<"individual" | "combined">(
    DEFAULT_RECORDING_CONFIG.mode,
  );
  const [fps, setFps] = useState(DEFAULT_RECORDING_CONFIG.fps);
  const [holdBeforeMs, setHoldBeforeMs] = useState(
    DEFAULT_RECORDING_CONFIG.holdBeforeMs,
  );
  const [holdAfterMs, setHoldAfterMs] = useState(
    DEFAULT_RECORDING_CONFIG.holdAfterMs,
  );
  const [holdFirstMs, setHoldFirstMs] = useState(
    DEFAULT_RECORDING_CONFIG.holdFirstMs,
  );
  const [holdBetweenMs, setHoldBetweenMs] = useState(
    DEFAULT_RECORDING_CONFIG.holdBetweenMs,
  );
  const [holdLastMs, setHoldLastMs] = useState(
    DEFAULT_RECORDING_CONFIG.holdLastMs,
  );

  const totalTransitions = Math.max(0, totalSteps - 1);
  const isRecording =
    recordingProgress != null && recordingProgress.phase === "recording";

  const handleStart = useCallback(() => {
    const config: RecordingConfig = {
      mode,
      fps,
      holdBeforeMs,
      holdAfterMs,
      holdFirstMs,
      holdBetweenMs,
      holdLastMs,
    };
    onStartRecording(config);
  }, [
    mode,
    fps,
    holdBeforeMs,
    holdAfterMs,
    holdFirstMs,
    holdBetweenMs,
    holdLastMs,
    onStartRecording,
  ]);

  const progressPercent = recordingProgress
    ? Math.round(recordingProgress.overallProgress * 100)
    : 0;

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title="動画書き出し" size="medium">
      <div className="flex flex-col gap-5">
        {/* モード選択 */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-300">
            書き出しモード
          </legend>
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 p-3 transition-colors hover:border-slate-500 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-500/10">
              <input
                type="radio"
                name="export-mode"
                value="combined"
                checked={mode === "combined"}
                onChange={() => setMode("combined")}
                disabled={isRecording}
                className="accent-blue-500"
              />
              <div>
                <div className="text-sm font-medium text-slate-200">
                  全体統合（1ファイル）
                </div>
                <div className="text-xs text-slate-400">
                  すべてのセグメント遷移を1つの動画にまとめます
                </div>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 p-3 transition-colors hover:border-slate-500 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-500/10">
              <input
                type="radio"
                name="export-mode"
                value="individual"
                checked={mode === "individual"}
                onChange={() => setMode("individual")}
                disabled={isRecording}
                className="accent-blue-500"
              />
              <div>
                <div className="text-sm font-medium text-slate-200">
                  セグメント個別（{totalTransitions}ファイル）
                </div>
                <div className="text-xs text-slate-400">
                  各セグメント遷移を個別の動画ファイルとして書き出します
                </div>
              </div>
            </label>
          </div>
        </fieldset>

        {/* FPS 設定 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">
            フレームレート (FPS)
          </label>
          <select
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            disabled={isRecording}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value={24}>24 fps</option>
            <option value={30}>30 fps</option>
            <option value={60}>60 fps</option>
          </select>
        </div>

        {/* hold 時間設定 */}
        {mode === "combined" ? (
          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium text-slate-300">
              滞留時間（セグメントの表示時間）
            </div>
            <NumberInputRow
              label="冒頭の表示時間"
              value={holdFirstMs}
              onChange={setHoldFirstMs}
              disabled={isRecording}
              unit="ms"
              step={100}
              min={0}
            />
            <NumberInputRow
              label="セグメント間の表示時間"
              value={holdBetweenMs}
              onChange={setHoldBetweenMs}
              disabled={isRecording}
              unit="ms"
              step={100}
              min={0}
            />
            <NumberInputRow
              label="末尾の表示時間"
              value={holdLastMs}
              onChange={setHoldLastMs}
              disabled={isRecording}
              unit="ms"
              step={100}
              min={0}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium text-slate-300">
              滞留時間（遷移前後の静止時間）
            </div>
            <NumberInputRow
              label="遷移前の静止時間"
              value={holdBeforeMs}
              onChange={setHoldBeforeMs}
              disabled={isRecording}
              unit="ms"
              step={100}
              min={0}
            />
            <NumberInputRow
              label="遷移後の静止時間"
              value={holdAfterMs}
              onChange={setHoldAfterMs}
              disabled={isRecording}
              unit="ms"
              step={100}
              min={0}
            />
          </div>
        )}

        {/* 進捗表示 */}
        {recordingProgress != null && recordingProgress.phase !== "idle" && (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            {recordingProgress.phase === "recording" && (
              <>
                <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                  <span>
                    遷移 {recordingProgress.currentTransitionIndex + 1} /{" "}
                    {recordingProgress.totalTransitions} を録画中...
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </>
            )}
            {recordingProgress.phase === "done" && (
              <div className="text-center text-sm text-green-400">
                書き出しが完了しました
              </div>
            )}
            {recordingProgress.phase === "error" && (
              <div className="text-center text-sm text-red-400">
                エラー: {recordingProgress.errorMessage ?? "不明なエラー"}
              </div>
            )}
          </div>
        )}

        {/* アクションボタン */}
        <div className="flex items-center justify-end gap-2">
          {isRecording && onAbortRecording && (
            <Button
              size="small"
              onClick={onAbortRecording}
              className="bg-red-600 hover:bg-red-700"
            >
              中断
            </Button>
          )}
          <Button
            size="small"
            onClick={handleStart}
            disabled={isRecording || totalTransitions === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isRecording ? "録画中..." : "書き出し開始"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** 数値入力の行コンポーネント */
function NumberInputRow({
  label,
  value,
  onChange,
  disabled,
  unit,
  step = 100,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  unit: string;
  step?: number;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value)))}
          disabled={disabled}
          step={step}
          min={min}
          className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-right text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  );
}
