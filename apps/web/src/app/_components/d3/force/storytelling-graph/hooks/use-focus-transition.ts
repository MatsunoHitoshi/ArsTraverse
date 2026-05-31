"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { easeOutCubic, easeInOutCubic } from "../utils/graph-utils";

export const FOCUS_TRANSITION_MS = 1200;
const FADE_DELAY_MS = 200;
const FADE_DURATION_MS = FOCUS_TRANSITION_MS - FADE_DELAY_MS;
/** カメラ遷移完了後にエッジ描画・ノードフェードを行うフェーズの所要時間（ms） */
export const POST_FOCUS_FADE_MS = 1000;
/** freeExploreMode でのカメラ遷移中 setState スロットル間隔（ms）。約 20fps */
const TRANSITION_STATE_THROTTLE_MS = 50;

export type LayoutTransform = { scale: number; centerX: number; centerY: number };
export type NodeViewCoords = { from: [number, number]; to: [number, number] };
export type EdgeViewCoords = {
  from: { sx: number; sy: number; tx: number; ty: number };
  to: { sx: number; sy: number; tx: number; ty: number };
};
export type EdgeLabelCoords = {
  from: { x: number; y: number; angle: number };
  to: { x: number; y: number; angle: number };
};
export type NodeOpacity = { opacity0: number; opacity1: number };

/**
 * フォーカス遷移ライフサイクルを管理するフック。
 *
 * - freeExploreMode 以外: カメラ遷移中は React re-render を発生させず、
 *   RAF で SVG 要素を直接 DOM 操作してアニメーションする。
 *   遷移完了後は postFocusFade フェーズを起動してエッジ描画アニメを行う。
 * - freeExploreMode: setState を 50ms スロットルして React に委ねる。
 */
export function useFocusTransition({
  focusNodeIds,
  focusEdgeIds,
  showFullGraph,
  freeExploreMode,
  onFocusWillChange,
  onTransitionComplete,
}: {
  focusNodeIds: string[];
  focusEdgeIds: string[];
  showFullGraph: boolean;
  freeExploreMode: boolean;
  /** フォーカス変更直前に呼ばれるコールバック。呼び出し元がレイアウト transform をキャプチャするために使用 */
  onFocusWillChange?: (prevNodeIds: string[], prevEdgeIds: string[]) => void;
  onTransitionComplete?: () => void;
}) {
  const [transitionElapsedMs, setTransitionElapsedMs] = useState(FOCUS_TRANSITION_MS);
  const transitionElapsedMsRef = useRef(FOCUS_TRANSITION_MS);
  const [transitionFromNodeIds, setTransitionFromNodeIds] = useState<string[]>(focusNodeIds);
  const lastFocusNodeIdsRef = useRef<string[]>(focusNodeIds);
  const lastFocusEdgeIdsRef = useRef<string[]>(focusEdgeIds);
  const lastShowFullGraphRef = useRef(showFullGraph);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const lastFlushTimeRef = useRef(0);
  /** カメラ遷移 RAF が動いているあいだ true。セグメントアニメ RAF はこの間 setState を呼ばない */
  const isFocusTransitionActiveRef = useRef(false);

  // ── post-focus フェード フェーズ（カメラ遷移完了後にエッジ描画を担う） ──
  const [postFocusFadeActive, setPostFocusFadeActive] = useState(false);
  const [postFocusFadeTimeMs, setPostFocusFadeTimeMs] = useState(0);
  const postFocusFadeStartTimeRef = useRef(0);
  const postFocusFadeRafRef = useRef<number | null>(null);
  const lastPostFocusFlushTimeRef = useRef(0);

  // ── DOM 直接操作用 refs ──
  /** StoryGraphContent の最上位 <g> に attach する */
  const graphContentRef = useRef<SVGGElement>(null);
  /** 遷移開始時に fromLayout をキャプチャ。主コンポーネントの onFocusWillChange 内で書き込む */
  const fromLayoutRef = useRef<LayoutTransform>({ scale: 1, centerX: 0, centerY: 0 });
  /** 各ノードの遷移開始・終了ビュー座標 */
  const transitionNodeViewCoordsRef = useRef<Map<string, NodeViewCoords>>(new Map());
  /** 各エッジ（方向付きキー）の遷移開始・終了ビュー座標 */
  const transitionEdgeViewCoordsRef = useRef<Map<string, EdgeViewCoords>>(new Map());
  /** 各エッジラベル（pairKey）の遷移開始・終了ビュー座標 */
  const transitionEdgeLabelCoordsRef = useRef<Map<string, EdgeLabelCoords>>(new Map());
  /** ノードの遷移前後 opacity */
  const transitionNodeOpacityRef = useRef<Map<string, NodeOpacity>>(new Map());
  /** DOM 要素キャッシュ（毎フレーム querySelector を避けてラズパイ等での負荷を軽減） */
  const transitionNodeElsRef = useRef<Map<string, SVGElement>>(new Map());
  const transitionEdgePathElsRef = useRef<Map<string, SVGPathElement[]>>(new Map());
  const transitionEdgeLabelElsRef = useRef<Map<string, SVGElement>>(new Map());

  const onFocusWillChangeRef = useRef(onFocusWillChange);
  onFocusWillChangeRef.current = onFocusWillChange;
  const onTransitionCompleteRef = useRef(onTransitionComplete);
  onTransitionCompleteRef.current = onTransitionComplete;

  useEffect(() => {
    const prevNodeIds = lastFocusNodeIdsRef.current;
    const prevEdgeIds = lastFocusEdgeIdsRef.current;
    const prevShowFullGraph = lastShowFullGraphRef.current;
    const nodeIdsEqual =
      prevNodeIds.length === focusNodeIds.length &&
      prevNodeIds.every((id, i) => id === focusNodeIds[i]);
    const edgeIdsEqual =
      prevEdgeIds.length === focusEdgeIds.length &&
      prevEdgeIds.every((id, i) => id === focusEdgeIds[i]);
    const showFullGraphUnchanged = prevShowFullGraph === showFullGraph;
    if (nodeIdsEqual && edgeIdsEqual && showFullGraphUnchanged) return;

    // フォーカス変更を通知（レイアウト transform をキャプチャするために使用）
    onFocusWillChangeRef.current?.(prevNodeIds, prevEdgeIds);

    setTransitionFromNodeIds(prevNodeIds);
    lastFocusNodeIdsRef.current = focusNodeIds;
    lastFocusEdgeIdsRef.current = focusEdgeIds;
    lastShowFullGraphRef.current = showFullGraph;
    setTransitionElapsedMs(0);
    transitionElapsedMsRef.current = 0;

    if (!freeExploreMode) {
      isFocusTransitionActiveRef.current = true;
      transitionNodeElsRef.current.clear();
      transitionEdgePathElsRef.current.clear();
      transitionEdgeLabelElsRef.current.clear();
    }

    /** 1回目の React 再描画完了後の次フレームで要素を収集し tick 開始。
     *  DOM が確実に更新された後に querySelectorAll を呼ぶため 1 フレーム遅延させる。 */
    const startTickLoop = () => {
      startTimeRef.current = performance.now();
      lastFlushTimeRef.current = startTimeRef.current;

      const collectAndStartTick = () => {
        if (!freeExploreMode) {
          const root = graphContentRef.current;
          if (root) {
            const safeSelectorValue = (value: string) =>
              typeof CSS !== "undefined" && typeof CSS.escape === "function"
                ? CSS.escape(value)
                : value.replace(/["\\]/g, "\\$&");
            transitionNodeViewCoordsRef.current.forEach((_, nodeId) => {
              const el = root.querySelector(`[data-node-id="${safeSelectorValue(nodeId)}"]`);
              if (el instanceof SVGElement) transitionNodeElsRef.current.set(nodeId, el);
            });
            // 取得漏れエッジを再試行（React の遅延コミットに対応）
            transitionEdgeViewCoordsRef.current.forEach((_, edgeKey) => {
              const paths = Array.from(
                root.querySelectorAll<SVGPathElement>(
                  `path[data-edge-key="${safeSelectorValue(edgeKey)}"]`,
                ),
              );
              if (paths.length) transitionEdgePathElsRef.current.set(edgeKey, paths);
            });
            transitionEdgeLabelCoordsRef.current.forEach((_, pairKey) => {
              const el = root.querySelector(
                `[data-edge-label-key="${safeSelectorValue(pairKey)}"]`,
              );
              if (el instanceof SVGElement) transitionEdgeLabelElsRef.current.set(pairKey, el);
            });
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      requestAnimationFrame(collectAndStartTick);
    };

    const tick = (now: number) => {
      const rawElapsed = now - startTimeRef.current;
      const clamped = Math.min(Math.max(0, rawElapsed), FOCUS_TRANSITION_MS);
      transitionElapsedMsRef.current = clamped;

      if (!freeExploreMode) {
        // カメラ遷移: React を介さず DOM を直接更新（毎フレーム 60fps）
        const progress = easeInOutCubic(clamped / FOCUS_TRANSITION_MS);
        const rawFadeProgress =
          clamped <= FADE_DELAY_MS
            ? 0
            : Math.min(1, (clamped - FADE_DELAY_MS) / FADE_DURATION_MS);
        const opacityProgress = easeOutCubic(rawFadeProgress);

        transitionNodeViewCoordsRef.current.forEach((coords, nodeId) => {
          const el = transitionNodeElsRef.current.get(nodeId);
          if (!el) return;
          const [fx, fy] = coords.from;
          const [tx, ty] = coords.to;
          const x = fx + (tx - fx) * progress;
          const y = fy + (ty - fy) * progress;
          el.setAttribute("transform", `translate(${x},${y})`);
          const op = transitionNodeOpacityRef.current.get(nodeId);
          if (op) {
            el.style.opacity = String(op.opacity0 + (op.opacity1 - op.opacity0) * opacityProgress);
          }
        });

        transitionEdgeViewCoordsRef.current.forEach((coords, edgeKey) => {
          const p = progress;
          const sx = coords.from.sx + (coords.to.sx - coords.from.sx) * p;
          const sy = coords.from.sy + (coords.to.sy - coords.from.sy) * p;
          const tx = coords.from.tx + (coords.to.tx - coords.from.tx) * p;
          const ty = coords.from.ty + (coords.to.ty - coords.from.ty) * p;
          const d = `M ${sx} ${sy} L ${tx} ${ty}`;
          const paths = transitionEdgePathElsRef.current.get(edgeKey);
          if (paths) {
            for (const pathEl of paths) pathEl.setAttribute("d", d);
          }
        });

        transitionEdgeLabelCoordsRef.current.forEach((coords, pairKey) => {
          const el = transitionEdgeLabelElsRef.current.get(pairKey);
          if (!el) return;
          const x = coords.from.x + (coords.to.x - coords.from.x) * progress;
          const y = coords.from.y + (coords.to.y - coords.from.y) * progress;
          const angle =
            coords.from.angle + (coords.to.angle - coords.from.angle) * progress;
          el.setAttribute("transform", `translate(${x},${y}) rotate(${angle})`);
        });
      } else {
        // freeExploreMode: スロットルしながら setState
        const timeSinceFlush = now - lastFlushTimeRef.current;
        const shouldFlush =
          clamped >= FOCUS_TRANSITION_MS || timeSinceFlush >= TRANSITION_STATE_THROTTLE_MS;
        if (shouldFlush) {
          lastFlushTimeRef.current = now;
          requestAnimationFrame(() => setTransitionElapsedMs(clamped));
        }
      }

      if (clamped >= FOCUS_TRANSITION_MS) {
        isFocusTransitionActiveRef.current = false;
        if (!freeExploreMode) {
          // post-focus フェーズ起動（エッジ描画アニメをカメラ遷移から分離）
          postFocusFadeStartTimeRef.current = performance.now();
          setTransitionElapsedMs(FOCUS_TRANSITION_MS);
          setPostFocusFadeTimeMs(0);
          setPostFocusFadeActive(true);
        } else {
          setTransitionElapsedMs(FOCUS_TRANSITION_MS);
        }
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(startTickLoop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      isFocusTransitionActiveRef.current = false;
    };
  }, [focusNodeIds, focusEdgeIds, showFullGraph, freeExploreMode]);

  // post-focus フェード フェーズ
  useEffect(() => {
    if (!postFocusFadeActive) return;
    lastPostFocusFlushTimeRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - postFocusFadeStartTimeRef.current;
      const timeSinceFlush = now - lastPostFocusFlushTimeRef.current;
      const shouldFlush =
        elapsed >= POST_FOCUS_FADE_MS || timeSinceFlush >= TRANSITION_STATE_THROTTLE_MS;
      if (shouldFlush) {
        lastPostFocusFlushTimeRef.current = now;
        const valueToFlush = Math.min(elapsed, POST_FOCUS_FADE_MS);
        requestAnimationFrame(() => setPostFocusFadeTimeMs(valueToFlush));
      }
      if (elapsed >= POST_FOCUS_FADE_MS) {
        postFocusFadeRafRef.current = null;
        setPostFocusFadeActive(false);
        onTransitionCompleteRef.current?.();
      } else {
        postFocusFadeRafRef.current = requestAnimationFrame(tick);
      }
    };
    postFocusFadeRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (postFocusFadeRafRef.current != null) {
        cancelAnimationFrame(postFocusFadeRafRef.current);
        postFocusFadeRafRef.current = null;
      }
    };
  }, [postFocusFadeActive]);

  /** カメラ遷移と post-focus フェードの両方が完了したとき true */
  const isTransitionComplete = transitionElapsedMs >= FOCUS_TRANSITION_MS && !postFocusFadeActive;

  const viewProgress = useMemo(
    () =>
      isTransitionComplete
        ? 1
        : easeOutCubic(Math.min(1, transitionElapsedMs / FOCUS_TRANSITION_MS)),
    [transitionElapsedMs, isTransitionComplete],
  );

  const fadeProgress = useMemo(
    () =>
      isTransitionComplete
        ? 1
        : transitionElapsedMs <= FADE_DELAY_MS
          ? 0
          : easeOutCubic(Math.min(1, (transitionElapsedMs - FADE_DELAY_MS) / FADE_DURATION_MS)),
    [transitionElapsedMs, isTransitionComplete],
  );

  const postFocusFadeProgress = postFocusFadeActive
    ? easeOutCubic(Math.min(1, postFocusFadeTimeMs / POST_FOCUS_FADE_MS))
    : 0;

  return {
    transitionElapsedMs,
    transitionElapsedMsRef,
    transitionFromNodeIds,
    isTransitionComplete,
    isFocusTransitionActiveRef,
    postFocusFadeActive,
    postFocusFadeProgress,
    viewProgress,
    fadeProgress,
    lastFocusNodeIdsRef,
    lastFocusEdgeIdsRef,
    lastShowFullGraphRef,
    // DOM 直接操作用（主コンポーネントが render で書き込み、hook の RAF が読み取る）
    graphContentRef,
    fromLayoutRef,
    transitionNodeViewCoordsRef,
    transitionEdgeViewCoordsRef,
    transitionEdgeLabelCoordsRef,
    transitionNodeOpacityRef,
  };
}
