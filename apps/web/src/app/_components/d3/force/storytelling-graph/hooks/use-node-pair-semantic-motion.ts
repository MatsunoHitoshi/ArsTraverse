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
  activeEdgeIds,
  sharedEndpointId,
}: {
  enabled: boolean;
  links: CustomLinkType[];
  /** 分類キャッシュ更新時に参照が変わること（useEdgeSemanticAnimation の useCallback 依存） */
  getEdgeMotionConfig: (edgeId: string) => EdgeMotionConfig | null;
  /** 指定時はこのエッジ群の端点だけを動かす（順次/グループ再生用） */
  activeEdgeIds?: Set<string> | null;
  /** グループ再生時の共有端点。位置は固定し、scale pulse のみ与える */
  sharedEndpointId?: string | null;
}): {
  getNodePairTransform: (nodeId: string) => NodePairTransform | null;
} {
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const activeEdgeKey = useMemo(
    () => (activeEdgeIds ? [...activeEdgeIds].sort().join("|") : ""),
    [activeEdgeIds],
  );

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
        isSharedEndpoint: boolean;
      }
    >();

    for (const link of links) {
      if (activeEdgeIds != null && !activeEdgeIds.has(link.id)) continue;

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
      const sourceIsShared = src.id === sharedEndpointId;
      const targetIsShared = tgt.id === sharedEndpointId;

      if (!entries.has(src.id)) {
        entries.set(src.id, {
          category: config.category,
          role: "source",
          durationMs,
          edgeVec,
          isSharedEndpoint: sourceIsShared,
        });
      }
      if (!entries.has(tgt.id)) {
        entries.set(tgt.id, {
          category: config.category,
          role: "target",
          durationMs,
          edgeVec,
          isSharedEndpoint: targetIsShared,
        });
      }
    }

    return entries.size > 0 ? entries : null;
  }, [enabled, links, getEdgeMotionConfig, activeEdgeIds, sharedEndpointId]);

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

    startRef.current = null;
    setElapsedMs(0);

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
  }, [shouldAnimate, activeEdgeKey]);

  const getNodePairTransform = useMemo<
    (nodeId: string) => NodePairTransform | null
  >(() => {
    if (!activeEntries) return () => null;

    return (nodeId: string) => {
      const entry = activeEntries.get(nodeId);
      if (!entry) return null;

      if (entry.isSharedEndpoint) {
        const t = (elapsedMs % entry.durationMs) / entry.durationMs;
        const pulse = Math.abs(Math.sin(Math.PI * 2 * t));
        return { dx: 0, dy: 0, scale: 1 + 0.06 * pulse };
      }

      const spec = CDT_NODE_PAIR_MAP[entry.category];
      const t = (elapsedMs % entry.durationMs) / entry.durationMs;
      return computeNodePairOffset(spec, entry.role, t, entry.edgeVec);
    };
  }, [activeEntries, elapsedMs]);

  return { getNodePairTransform };
}
