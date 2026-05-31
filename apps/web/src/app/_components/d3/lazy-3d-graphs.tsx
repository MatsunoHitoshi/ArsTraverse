"use client";

import dynamic from "next/dynamic";

/** @react-three/fiber は SSR / 静的 import 時に React インスタンス不一致を起こすため遅延読み込み */
export const D3SphericalGraph = dynamic(
  () =>
    import("./spherical/spherical-graph").then((mod) => ({
      default: mod.D3SphericalGraph,
    })),
  { ssr: false },
);

export const D3MultiLayerGraph = dynamic(
  () =>
    import("./layer/multi-layer-graph").then((mod) => ({
      default: mod.D3MultiLayerGraph,
    })),
  { ssr: false },
);
