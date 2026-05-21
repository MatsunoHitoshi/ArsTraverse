"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import type { EdgeMotionConfig } from "@/app/const/edge-cdt-animation";
import {
  CDT_NODE_PAIR_MAP,
  computeNodePairOffset,
  getNodePairDurationMs,
  type NodePairTransform,
} from "@/app/const/edge-cdt-node-pair-animation";

/**
 * CDT カテゴリに基づくノードペア間のセマンティック・モーションを駆動するフック。
 *
 * エッジのピクトグラム / ストローク・アニメーションと同じ durationMs でループし、
 * フォーカスエッジの端点ノードにビュー空間オフセット + スケール変位を返す。
 * レイアウト座標 (node.x, node.y) は変更しない。
 */
export function useNodePairSemanticMotion({
  enabled,
  links,
  getEdgeMotionConfig,
}: {
  enabled: boolean;
  links: CustomLinkType[];
  /** 分類キャッシュ更新時に参照が変わること（useEdgeSemanticAnimation の useCallback 依存） */
  getEdgeMotionConfig: (edgeId: string) => EdgeMotionConfig | null;
}): {
  getNodePairTransform: (nodeId: string) => NodePairTransform | null;
} {
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  /** nodeId → { category, role, durationMs, edgeVec } for each endpoint of active edges */
  const activeEntries = useMemo(() => {
    if (!enabled) return null;

    const entries = new Map<
      string,
      {
        category: EdgeMotionConfig["category"];
        role: "source" | "target";
        durationMs: number;
        edgeVec: { ux: number; uy: number };
      }
    >();

    for (const link of links) {
      const config = getEdgeMotionConfig(link.id);
      if (!config) continue;

      const src = link.source as CustomNodeType;
      const tgt = link.target as CustomNodeType;
      if (!src || !tgt || src.x == null || src.y == null || tgt.x == null || tgt.y == null) continue;

      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      const edgeVec = { ux: dx / len, uy: dy / len };
      const durationMs = getNodePairDurationMs(config.category);

      if (!entries.has(src.id)) {
        entries.set(src.id, { category: config.category, role: "source", durationMs, edgeVec });
      }
      if (!entries.has(tgt.id)) {
        entries.set(tgt.id, { category: config.category, role: "target", durationMs, edgeVec });
      }
    }

    return entries.size > 0 ? entries : null;
  }, [enabled, links, getEdgeMotionConfig]);

  const shouldAnimate = activeEntries != null;

  useEffect(() => {
    if (!shouldAnimate) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startRef.current = null;
      setElapsedMs(0);
      return;
    }

    const tick = (now: number) => {
      if (startRef.current == null) {
        startRef.current = now;
      }
      setElapsedMs(now - startRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [shouldAnimate]);

  const getNodePairTransform = useMemo<
    (nodeId: string) => NodePairTransform | null
  >(() => {
    if (!activeEntries) return () => null;

    return (nodeId: string) => {
      const entry = activeEntries.get(nodeId);
      if (!entry) return null;

      const spec = CDT_NODE_PAIR_MAP[entry.category];
      const t = (elapsedMs % entry.durationMs) / entry.durationMs;
      return computeNodePairOffset(spec, entry.role, t, entry.edgeVec);
    };
  }, [activeEntries, elapsedMs]);

  return { getNodePairTransform };
}
