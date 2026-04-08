"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

interface ResizableSplitLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
  isRightOpen: boolean;
  defaultLeftRatio?: number;
  minLeftRatio?: number;
  maxLeftRatio?: number;
  className?: string;
  leftPaneClassName?: string;
  rightPaneClassName?: string;
  dividerClassName?: string;
  onResize?: (leftRatio: number) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const ResizableSplitLayout = ({
  left,
  right,
  isRightOpen,
  defaultLeftRatio = 2 / 3,
  minLeftRatio = 0.35,
  maxLeftRatio = 0.8,
  className = "",
  leftPaneClassName = "",
  rightPaneClassName = "",
  dividerClassName = "",
  onResize,
}: ResizableSplitLayoutProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasUserResized, setHasUserResized] = useState(false);
  const [leftRatio, setLeftRatio] = useState(
    clamp(defaultLeftRatio, minLeftRatio, maxLeftRatio),
  );

  const clampedDefaultRatio = useMemo(
    () => clamp(defaultLeftRatio, minLeftRatio, maxLeftRatio),
    [defaultLeftRatio, minLeftRatio, maxLeftRatio],
  );

  useEffect(() => {
    if (!hasUserResized) {
      setLeftRatio(clampedDefaultRatio);
    }
  }, [clampedDefaultRatio, hasUserResized]);

  useEffect(() => {
    if (!isDragging) return;

    const onPointerMove = (event: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (!rect.width) return;

      const rawRatio = (event.clientX - rect.left) / rect.width;
      const next = clamp(rawRatio, minLeftRatio, maxLeftRatio);
      setLeftRatio(next);
      onResize?.(next);
    };

    const stopDragging = () => {
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [isDragging, maxLeftRatio, minLeftRatio, onResize]);

  const onDividerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setHasUserResized(true);
    setIsDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  return (
    <div ref={containerRef} className={`flex w-full ${className}`}>
      <div
        className={leftPaneClassName}
        style={{ width: isRightOpen ? `${leftRatio * 100}%` : "100%" }}
      >
        {left}
      </div>

      {isRightOpen && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panels"
            className={`relative flex w-3 flex-shrink-0 cursor-col-resize items-stretch justify-center ${dividerClassName}`}
            onPointerDown={onDividerPointerDown}
          >
            <div className="my-1 w-[2px] rounded bg-slate-600/80" />
            <div className="absolute inset-y-0 left-1/2 w-6 -translate-x-1/2" />
          </div>
          <div className={`min-w-0 flex-1 ${rightPaneClassName}`}>{right}</div>
        </>
      )}
    </div>
  );
};
