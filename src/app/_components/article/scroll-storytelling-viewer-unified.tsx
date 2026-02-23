"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { MetaGraphStoryData } from "@/app/_hooks/use-meta-graph-story";
import { Scrollama, Step } from "react-scrollama";
import type { ScrollamaStepCallbackArg, ScrollamaProgressCallbackArg } from "react-scrollama";
import {
  StorytellingGraphUnified,
  easeOutCubic,
} from "../d3/force/storytelling-graph-unified";
import {
  buildScrollStepsFromMetaGraphStoryData,
  getSegmentNodeIdsFromMetaGraphStoryData,
  type ScrollStep,
} from "@/app/_utils/story-scroll-utils";
import { usePathname, useSearchParams } from "next/navigation";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import {
  CheckIcon,
  DownArrowIcon,
  Link2Icon,
  ResetIcon,
  UpArrowIcon,
  ZoomInIcon,
} from "../icons/icons";
import { getEdgeCompositeKeyFromLink } from "@/app/const/story-segment";
import { StoryStepContent } from "./story-step-content";

const XL_BREAKPOINT = 1280;
const GRAPH_MIN_HEIGHT = 400;
/** グラフエリアの高さ（PC / SP）。SP版はオーバービュー・セグメントで統一し、遷移時のResizeObserver発火・D3再計算を防ぐ */
const GRAPH_SECTION_HEIGHT_PC = "min(95vh, 800px)";
const GRAPH_SECTION_HEIGHT_SP = "min(72vh, 600px)";
/** 1画面に1セグメントのみ表示するため、各ステップをビューポート高に揃える（SP: 65vh / PC: 100vh で1セグメントに制限） */
const STEP_VIEWPORT_HEIGHT_SP = "65vh";
const STEP_VIEWPORT_HEIGHT_PC = "100vh";
/** SP版でテキストをグラフ下端に重ねる量（フェード帯の高さ） */
const SP_FADE_OVERLAP_PX = 96;
/** Scrollama: ステップが「入った」とみなすビューポート上の位置 (0–1)。0.99 で段落が画面下端付近に入った時点でグラフが切り替わり、見ている段落と一致する */
const SCROLLAMA_OFFSET = 0.99;
/** セグメント進入後、アニメーション開始まで遅延する時間（ms） */
const SEGMENT_ANIMATION_DELAY_MS = 500;
/** セグメント進入後のノードフェード・エッジ線描画アニメーションの所要時間（ms） */
const SEGMENT_ANIMATION_DURATION_MS = 2000;

export interface ScrollStorytellingViewerUnifiedProps {
  graphDocument: GraphDocumentForFrontend;
  metaGraphData: MetaGraphStoryData;
  /** 最初の「グラフ全体」セクションのタイトル（ワークスペース名を渡す） */
  workspaceTitle?: string;
}

export function ScrollStorytellingViewerUnified({
  graphDocument,
  metaGraphData,
  workspaceTitle,
}: ScrollStorytellingViewerUnifiedProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [innerWidth] = useWindowSize();
  const [copiedCommunityId, setCopiedCommunityId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progressStepIndex, setProgressStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 400, height: GRAPH_MIN_HEIGHT });
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [isFreeExploreMode, setIsFreeExploreMode] = useState(false);
  const frozenGraphIndexRef = useRef(0);
  /** セグメント進入後のフェード・線描画の progress（0–1）。state で保持し RAF で更新する */
  const [segmentProgress, setSegmentProgress] = useState(1);
  /** セグメント進入時刻。RAF 内で経過時間計算に使用 */
  const segmentStartTimeRef = useRef(0);
  /** アニメを開始したステップ。一致するときだけ segmentProgress をグラフに渡し、不一致の初回は 0 を渡してフラッシュを防ぐ */
  const segmentStepIndexRef = useRef(0);
  /** onStepEnter の直後、次の 1 回のレンダーで必ず 0 を渡す（setState の遅延で segmentProgress がまだ 1 のときのフラッシュ防止） */
  const forceZeroNextPassRef = useRef(false);

  const steps = useMemo(() => {
    const storySteps = buildScrollStepsFromMetaGraphStoryData(metaGraphData);
    // オーバービューは nodeIds/edgeIds を空にし、グラフ側で showFullGraph 時に baseGraph の全ノード・全エッジを参照させる（コミュニティフォーカスと同じ情報源）
    const overviewStep: ScrollStep = {
      id: "__overview__",
      communityId: "",
      communityTitle: workspaceTitle ?? "グラフ全体",
      text: " ",
      nodeIds: [],
      edgeIds: [],
    };
    return [overviewStep, ...storySteps];
  }, [metaGraphData, workspaceTitle]);

  const isPc = (innerWidth ?? 0) >= XL_BREAKPOINT;

  const [topSentinelInView, setTopSentinelInView] = useState(true);
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const intersecting = entry?.isIntersecting ?? false;
        if (!intersecting) {
          setTopSentinelInView(false);
          return;
        }
        // ヘッダ非表示時のレイアウト変化で IO が spurious に true を返し、
        // graphIndex が 0 に戻ってカメラが戻る現象を防ぐ。 scrollY>=100 なら無視。
        const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
        setTopSentinelInView(scrollY < 100);
      },
      { threshold: 0, rootMargin: "-1px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.scrollSnapType;
    html.style.scrollSnapType = "y mandatory";
    return () => {
      html.style.scrollSnapType = previous;
    };
  }, []);

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      setGraphSize({
        width: Math.max(200, Math.floor(width)),
        height: Math.max(GRAPH_MIN_HEIGHT, Math.floor(height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isPc]);

  const onStepEnter = useCallback((arg: ScrollamaStepCallbackArg) => {
    const index = Number(arg.data);
    forceZeroNextPassRef.current = true;
    setCurrentStepIndex(index);
    setProgressStepIndex(index);
    setStepProgress(0);
    setSegmentProgress(0);
  }, []);

  const onStepProgress = useCallback((arg: ScrollamaProgressCallbackArg) => {
    const index = Number(arg.data);
    setProgressStepIndex(index);
    // progress は時間ベースのためここでは更新しない
  }, []);

  // セグメント進入時に時間ベースで segmentProgress を 0→1 に更新する RAF。SEGMENT_ANIMATION_DELAY_MS 経過後にアニメーション開始
  useEffect(() => {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    segmentStartTimeRef.current = now + SEGMENT_ANIMATION_DELAY_MS;
    setSegmentProgress(0);

    let rafId: number;
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - segmentStartTimeRef.current);
      const raw = Math.min(1, elapsed / SEGMENT_ANIMATION_DURATION_MS);
      const eased = easeOutCubic(raw);
      setSegmentProgress(eased);
      if (eased < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [progressStepIndex]);

  const graphIndex =
    topSentinelInView
      ? 0
      : Math.max(
        0,
        Math.min(progressStepIndex, steps.length - 1),
      );
  const progressStep = steps[graphIndex];

  // 自由探索モードに入った時点のセグメントでグラフを固定する
  const displayGraphIndex = isFreeExploreMode ? frozenGraphIndexRef.current : graphIndex;
  const displayStep = steps[displayGraphIndex];

  const segmentNodeIds = useMemo(
    () => displayStep?.nodeIds ?? [],
    [displayStep?.nodeIds],
  );
  const segmentEdgeIds = useMemo(
    () => displayStep?.edgeIds ?? [],
    [displayStep?.edgeIds],
  );
  const segmentHasNoFocus =
    segmentNodeIds.length === 0 && segmentEdgeIds.length === 0;

  const { graphNodeIds, graphEdgeIds } = useMemo(() => {
    if (!segmentHasNoFocus || !displayStep?.communityId || !metaGraphData.communityMap) {
      return { graphNodeIds: segmentNodeIds, graphEdgeIds: segmentEdgeIds };
    }
    const communityId = displayStep.communityId;
    const communityNodeIds = Object.entries(metaGraphData.communityMap)
      .filter(([, cid]) => cid === communityId)
      .map(([nodeId]) => nodeId);
    const communityNodeIdSet = new Set(communityNodeIds);
    const communityEdgeIds = (graphDocument?.relationships ?? [])
      .filter(
        (rel) =>
          communityNodeIdSet.has(rel.sourceId) && communityNodeIdSet.has(rel.targetId),
      )
      .map((rel) => getEdgeCompositeKeyFromLink(rel));
    return {
      graphNodeIds: communityNodeIds,
      graphEdgeIds: communityEdgeIds,
    };
  }, [
    segmentHasNoFocus,
    displayStep?.communityId,
    metaGraphData.communityMap,
    graphDocument?.relationships,
    segmentNodeIds,
    segmentEdgeIds,
  ]);

  const communityTitles = useMemo(
    () =>
      Object.fromEntries(
        (metaGraphData.summaries ?? []).map((s) => [s.communityId, s.title]),
      ),
    [metaGraphData.summaries],
  );

  const allSegmentNodeIds = useMemo(
    () => getSegmentNodeIdsFromMetaGraphStoryData(metaGraphData),
    [metaGraphData],
  );

  const animationProgress =
    isFreeExploreMode
      ? 1
      : topSentinelInView
        ? 1
        : progressStepIndex === currentStepIndex
          ? stepProgress
          : progressStepIndex < currentStepIndex
            ? 1
            : 0;

  const toggleFreeExplore = useCallback(() => {
    if (!isFreeExploreMode) {
      frozenGraphIndexRef.current = graphIndex;
    }
    setIsFreeExploreMode((prev) => !prev);
  }, [isFreeExploreMode, graphIndex]);

  const goToFirstSegmentOfCommunity = useCallback(
    (communityId: string, options?: { instant?: boolean }) => {
      const index = steps.findIndex(
        (s) => s.communityId === communityId && s.id !== "__overview__",
      );
      if (index < 0) return;
      const targetIndex = index;
      const selector = `[data-story-step-index="${targetIndex}"]`;
      const behavior = options?.instant ? ("instant" as const) : ("smooth" as const);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector(selector);
          if (!el) return;
          if (isPc) {
            el.scrollIntoView({ behavior, block: "start" });
            return;
          }
          // SP: Scrollama の offset (0.99) で「入った」と判定される位置に合わせる。
          // セグメント上端がビューポート上端から 99% の高さに来るようにスクロールし、
          // 先頭セグメントで onStepEnter が発火するようにする。
          const rect = el.getBoundingClientRect();
          const targetScrollY =
            rect.top + window.scrollY - SCROLLAMA_OFFSET * window.innerHeight;
          window.scrollTo({
            top: Math.max(0, targetScrollY),
            behavior,
          });
        });
      });
    },
    [steps, isPc],
  );

  /** ページロード時: ?community=xxx があればコミュニティラベルクリックと同様に先頭セグメントへスクロール */
  const initialCommunityIdRef = useRef<string | null | undefined>(undefined);
  const communityFromUrlRef = useRef<string | null>(null);
  if (initialCommunityIdRef.current === undefined && typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search);
    initialCommunityIdRef.current = p.get("community") ?? p.get("section");
    console.log("[scroll-storytelling] initialCommunityIdRef:", initialCommunityIdRef.current, "search:", window.location.search);
  }
  useEffect(() => {
    const communityId = initialCommunityIdRef.current ?? searchParams.get("community") ?? searchParams.get("section");
    console.log("[scroll-storytelling] useEffect run:", { communityId, stepsLength: steps.length, alreadyProcessed: communityFromUrlRef.current });
    if (!communityId || !steps.length || communityFromUrlRef.current !== null) return;

    const timer = setTimeout(() => {
      communityFromUrlRef.current = communityId;
      console.log("[scroll-storytelling] timer fired, calling goToFirstSegmentOfCommunity:", communityId);
      goToFirstSegmentOfCommunity(communityId, { instant: true });
    }, 1000);
    return () => clearTimeout(timer);
    // searchParams を依存に含めると effect が再実行されタイマーがキャンセルされるため意図的に除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length, goToFirstSegmentOfCommunity]);

  const scrollToTop = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        topSentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, []);

  const scrollToNextSegment = useCallback(() => {
    if (steps.length < 2) return;
    const selector = `[data-story-step-index="1"]`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(selector);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, [steps.length]);

  const copySectionLink = useCallback(
    (communityId: string) => {
      if (typeof window === "undefined") return;
      const base = `${window.location.origin}${pathname ?? ""}`;
      const url =
        communityId === ""
          ? base
          : `${base}${base.includes("?") ? "&" : "?"}community=${encodeURIComponent(communityId)}`;
      void navigator.clipboard.writeText(url).then(
        () => {
          setCopiedCommunityId(communityId);
          window.setTimeout(() => setCopiedCommunityId(null), 1500);
        },
      ).catch(() => undefined);
    },
    [pathname],
  );

  if (steps.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-400">
        表示するストーリーがありません
      </div>
    );
  }

  const graphSection = (
    <div
      ref={graphContainerRef}
      className={`flex shrink-0 items-center justify-center overflow-hidden ${!isPc ? "relative from-slate-900 bg-gradient-to-b from-75% to-transparent" : ""}`}
      style={{
        minHeight: GRAPH_MIN_HEIGHT,
        height: isPc ? GRAPH_SECTION_HEIGHT_PC : GRAPH_SECTION_HEIGHT_SP,
        width: "100%",
      }}
    >

      <StorytellingGraphUnified
        key="storytelling-graph-unified"
        graphDocument={graphDocument}
        focusNodeIds={graphNodeIds}
        focusEdgeIds={graphEdgeIds}
        animationProgress={animationProgress}
        segmentProgress={(() => {
          let pass: number;
          if (forceZeroNextPassRef.current) {
            forceZeroNextPassRef.current = false;
            pass = 0;
          } else {
            const match = progressStepIndex === segmentStepIndexRef.current;
            if (!match && segmentProgress === 0) {
              segmentStepIndexRef.current = progressStepIndex;
            }
            pass = match ? segmentProgress : 0;
          }
          return pass;
        })()}
        scrollProgressStepIndex={progressStepIndex}
        scrollCurrentStepIndex={currentStepIndex}
        width={graphSize.width}
        height={graphSize.height}
        filter={metaGraphData.filter}
        segmentNodeIds={allSegmentNodeIds}
        freeExploreMode={isFreeExploreMode}
        isPc={isPc}
        communityMap={metaGraphData.communityMap}
        narrativeFlow={metaGraphData.narrativeFlow}
        showFullGraph={displayStep?.id === "__overview__"}
        hasSpecificSegmentFocus={!segmentHasNoFocus}
        communityTitles={communityTitles}
        onCommunityTitleClick={goToFirstSegmentOfCommunity}
      />

      {/* グラフの端をフェードさせる軽量な CSS Overlay (SVG Mask の代わり)。PCのみ */}
      {isPc && (
        <div className="pointer-events-none absolute inset-0 z-0 h-full w-full">
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-slate-900 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-900 to-transparent" />
          <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-slate-900 to-transparent" />
          <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-slate-900 to-transparent" />
        </div>
      )}

      {displayStep?.id !== "__overview__" && (
        <div className="fixed bottom-4 right-4 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={scrollToTop}
            className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-700/90 text-slate-200 shadow hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
            aria-label="ページトップ（タイトル）へ戻る"
            title="ページトップ（タイトル）へ戻る"
          >
            <UpArrowIcon width={18} height={18} color="currentColor" />
          </button>
          <button
            type="button"
            onClick={toggleFreeExplore}
            className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-700/90 text-slate-200 shadow hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
            aria-label={isFreeExploreMode ? "自由探索を終了" : "自由探索モード"}
            title={isFreeExploreMode ? "自由探索を終了" : "グラフを自由にズーム・移動"}
          >
            {isFreeExploreMode ? (
              <ResetIcon width={18} height={18} color="currentColor" />
            ) : (
              <ZoomInIcon width={18} height={18} color="currentColor" />
            )}
          </button>
        </div>
      )}

    </div>
  );

  const segmentIndicator =
    typeof document !== "undefined" &&
    createPortal(
      <div
        className={`fixed top-1/2 z-[100] flex -translate-y-1/2 flex-col items-center gap-1.5 ${!isPc ? "right-1.5" : "right-4"}`}
        aria-hidden="true"
      >
        {steps.map((step, index) => (
          <span
            key={step.id}
            className={`shrink-0 rounded-full transition-colors duration-200 ${index === graphIndex ? "h-1.5 w-1.5 bg-slate-100 ring-2 ring-slate-800" : "h-1 w-1 bg-slate-600/50"}`}
          />
        ))}
      </div>,
      document.body,
    );

  return (
    <>
      {segmentIndicator}
      <div className="relative w-full max-w-7xl">
        <div
          ref={topSentinelRef}
          className="snap-start [scroll-snap-stop:always]"
          style={{ height: 4, minHeight: 4 }}
          aria-hidden="true"
        />
        <div
          className={
            isPc
              ? "flex flex-row mt-14"
              : "flex flex-col gap-6"
          }
        >
          {isPc ? (
            <>
              <div
                className="sticky flex w-2/3 top-0 shrink-0 flex-col self-start h-screen justify-center"
                style={{ willChange: "transform", transform: "translate3d(0,0,0)" }}
              >
                {graphSection}
              </div>
              <div className="relative min-w-0 flex-1 w-1/3">
                {progressStep?.communityTitle != null && progressStep.communityTitle !== "" && (
                  <div
                    className={`sticky top-72 z-10 flex w-full items-center gap-2 pb-2 pt-0 font-semibold text-white ${progressStep?.id === "__overview__" ? "text-4xl" : "text-xl"}`}
                  >
                    <span className="min-w-0 flex-1">{progressStep.communityTitle}</span>
                    <button
                      type="button"
                      onClick={() => copySectionLink(progressStep?.communityId ?? "")}
                      className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      aria-label="セクション冒頭へのリンクをコピー"
                      title="リンクをコピー"
                    >
                      {copiedCommunityId === (progressStep?.communityId ?? "") ? (
                        <CheckIcon width={14} height={14} color="#22c55e" />
                      ) : (
                        <Link2Icon width={14} height={14} color="currentColor" />
                      )}
                    </button>
                  </div>
                )}
                {/* PC版: 本文が入ってくる・出ていく時のフェード用グラデーション（上下） */}
                <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-[5] flex flex-col justify-between">
                  <div
                    className="sticky top-0 h-[50vh] shrink-0 bg-gradient-to-b from-slate-900 to-transparent"
                    aria-hidden
                  />
                  <div
                    className="sticky bottom-0 h-[50vh] shrink-0 bg-gradient-to-t from-slate-900 to-transparent"
                    aria-hidden
                  />
                </div>
                <Scrollama
                  offset={SCROLLAMA_OFFSET}
                  onStepEnter={onStepEnter}
                  onStepProgress={onStepProgress}
                  threshold={8}
                >
                  {steps.map((step, index) => (
                    <Step data={index} key={step.id}>
                      <StoryStepContent
                        step={step}
                        index={index}
                        graphDocument={graphDocument}
                        className="flex snap-start flex-col justify-center pr-4 [scroll-snap-stop:always]"
                        style={{
                          height: STEP_VIEWPORT_HEIGHT_PC,
                          minHeight: STEP_VIEWPORT_HEIGHT_PC,
                        }}
                      />
                    </Step>
                  ))}
                </Scrollama>
              </div>
            </>
          ) : (
            <>
              <div className="sticky top-0 z-10 w-full shrink-0 pb-2">
                {graphSection}
              </div>
              <div
                className="min-w-0 flex-1 p-4"
                style={{ marginTop: -SP_FADE_OVERLAP_PX }}
              >
                {progressStep?.communityTitle != null && progressStep.communityTitle !== "" && (
                  <div
                    className={
                      progressStep?.id === "__overview__"
                        ? "fixed bottom-24 left-4 right-4 z-10 flex items-center justify-center gap-2 font-semibold text-white text-3xl"
                        : "fixed -mt-20 z-10 flex items-center gap-2 pb-2 pt-0 font-semibold text-white text-lg"
                    }
                  >
                    <span className={progressStep?.id === "__overview__" ? "" : "min-w-0 flex-1"}>
                      {progressStep.communityTitle}
                    </span>
                    <button
                      type="button"
                      onClick={() => copySectionLink(progressStep?.communityId ?? "")}
                      className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      aria-label="セクション冒頭へのリンクをコピー"
                      title="リンクをコピー"
                    >
                      {copiedCommunityId === (progressStep?.communityId ?? "") ? (
                        <CheckIcon width={14} height={14} color="#22c55e" />
                      ) : (
                        <Link2Icon width={14} height={14} color="currentColor" />
                      )}
                    </button>
                  </div>
                )}
                {progressStep?.id === "__overview__" && (
                  <div className="fixed bottom-6 left-4 right-4 z-10 flex justify-center">
                    <button
                      type="button"
                      onClick={scrollToNextSegment}
                      className="flex flex-col items-center gap-1.5 text-slate-300/75 transition-opacity hover:opacity-100 hover:text-slate-200 cursor-pointer w-max p-4"
                      aria-label="次のセグメントへスクロール"
                    >
                      <span className="text-xs font-medium">スクロールして続きを見る</span>
                      <span className="animate-bounce">
                        <DownArrowIcon width={24} height={24} color="currentColor" />
                      </span>
                    </button>
                  </div>
                )}
                <Scrollama
                  offset={SCROLLAMA_OFFSET}
                  onStepEnter={onStepEnter}
                  onStepProgress={onStepProgress}
                  threshold={8}
                >
                  {steps.map((step, index) => (
                    <Step data={index} key={step.id}>
                      <StoryStepContent
                        step={step}
                        index={index}
                        graphDocument={graphDocument}
                        className="snap-start py-6 [scroll-snap-stop:always]"
                        style={{
                          height: STEP_VIEWPORT_HEIGHT_SP,
                          minHeight: STEP_VIEWPORT_HEIGHT_SP,
                        }}
                      />
                    </Step>
                  ))}
                </Scrollama>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
