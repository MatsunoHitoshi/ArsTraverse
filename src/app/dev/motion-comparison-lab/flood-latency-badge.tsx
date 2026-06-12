"use client";

import React from "react";

type FloodLatencyBadgeProps = {
  inferenceMs: number;
};

export function FloodLatencyBadge({ inferenceMs }: FloodLatencyBadgeProps) {
  const seconds = inferenceMs / 1000;
  const label =
    inferenceMs < 1000
      ? `${inferenceMs} ms`
      : `${seconds.toFixed(2)} s`;

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-700/50 bg-cyan-500/10 px-2.5 py-0.5 text-xs text-cyan-200 tabular-nums">
      <span className="text-cyan-400/80">GPU</span>
      {label}
    </span>
  );
}
