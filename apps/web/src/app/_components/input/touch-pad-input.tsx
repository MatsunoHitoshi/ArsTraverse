"use client";

import React, { useRef, useState, useCallback } from "react";

interface TouchPadProps {
  label: string;
  valueX: number;
  valueY: number;
  onChange: (x: number, y: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}

export function TouchPad({
  label,
  valueX,
  valueY,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled = false,
  formatValue = (val) => val.toFixed(2),
}: TouchPadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 値を座標（0-100%）に変換
  const getPositionFromValue = useCallback(
    (val: number) => {
      return ((val - min) / (max - min)) * 100;
    },
    [min, max]
  );

  // 座標から値を計算
  const getValueFromPosition = useCallback(
    (percentage: number) => {
      let val = min + (percentage / 100) * (max - min);
      if (step) {
        val = Math.round(val / step) * step;
      }
      // 範囲制限
      val = Math.max(min, Math.min(max, val));
      return val;
    },
    [min, max, step]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      if (!containerRef.current || disabled) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
      );
      const y = Math.max(
        0,
        Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)
      );

      // Y軸は上が0、下が100%だが、グラフ的には下がmin、上がmaxの方が直感的か？
      // 通常のXYパッドは左下が(min, min)であることが多い。
      // CSS座標系は左上が(0,0)。
      // ここでは左上を(min, max)、右下を(max, min)とするか、
      // あるいは左上(min, min)とするか。
      // 周波数に関しては直感的には右上が「強・強」なので、左下原点が良さそう。

      // 左下原点にするための変換
      // x: 0% -> min, 100% -> max (そのまま)
      // y: 100% -> min, 0% -> max (反転)

      const newValueX = getValueFromPosition(x);
      const newValueY = getValueFromPosition(100 - y); // Y軸反転

      onChange(newValueX, newValueY);
    },
    [disabled, getValueFromPosition, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const target = e.target as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setIsDragging(true);
    handlePointerMove(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    setIsDragging(false);
  };

  // グローバルなポインターイベントをリッスン（ドラッグ中に要素外でも動作するように）
  React.useEffect(() => {
    if (!isDragging) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      handlePointerMove(e);
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      setIsDragging(false);
      if (containerRef.current) {
        containerRef.current.releasePointerCapture?.(e.pointerId);
      }
    };

    document.addEventListener("pointermove", handleGlobalPointerMove);
    document.addEventListener("pointerup", handleGlobalPointerUp);

    return () => {
      document.removeEventListener("pointermove", handleGlobalPointerMove);
      document.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, [isDragging, handlePointerMove]);

  // ポジション計算（左下原点）
  const posX = getPositionFromValue(valueX);
  const posY = 100 - getPositionFromValue(valueY); // Y軸反転

  return (
    <div className="space-y-3 p-3 sm:p-4 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <div className="flex gap-2">
          <div className="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-mono min-w-[50px] text-center">
            X: {formatValue(valueX)}
          </div>
          <div className="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-mono min-w-[50px] text-center">
            Y: {formatValue(valueY)}
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative w-full flex-1 min-h-[160px] bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 touch-none cursor-crosshair ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {/* グリッド線 */}
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 pointer-events-none opacity-10">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="border-r border-b border-gray-500" />
          ))}
        </div>

        {/* カーソル */}
        <div
          className={`absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white shadow-lg transform transition-transform duration-75 pointer-events-none ${
            isDragging ? "scale-125 bg-blue-600" : "bg-blue-500"
          }`}
          style={{
            left: `${posX}%`,
            top: `${posY}%`,
          }}
        />

        {/* 軸ラベル */}
        <div className="absolute bottom-1 right-2 text-[10px] text-gray-400 pointer-events-none">
          X
        </div>
        <div className="absolute top-1 left-2 text-[10px] text-gray-400 pointer-events-none">
          Y
        </div>
      </div>
    </div>
  );
}
