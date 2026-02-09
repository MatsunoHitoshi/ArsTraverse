"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { MetaGraphStoryData } from "@/app/_hooks/use-meta-graph-story";
import { Scrollama, Step } from "react-scrollama";
import type { ScrollamaStepCallbackArg, ScrollamaProgressCallbackArg } from "react-scrollama";
import { StorytellingGraphUnified } from "../d3/force/storytelling-graph-unified";
import {
  buildScrollStepsFromMetaGraphStoryData,
  type ScrollStep,
} from "@/app/_utils/story-scroll-utils";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import { DownArrowIcon, ResetIcon, UpArrowIcon, ZoomInIcon } from "../icons/icons";
import { getEdgeCompositeKeyFromLink } from "@/app/const/story-segment";

/** セグメントがビューポートに入ったときにフェードインするラッパー */
function SegmentFadeIn({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { threshold: 0.3, rootMargin: "0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-opacity duration-300 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
    >
      {children}
    </div>
  );
}

const XL_BREAKPOINT = 1280;
const GRAPH_MIN_HEIGHT = 400;
/** グラフエリアの高さ（PC / SP） */
const GRAPH_SECTION_HEIGHT_PC = "min(95vh, 740px)";
const GRAPH_SECTION_HEIGHT_SP = "min(72vh, 600px)";
/** SP版の冒頭（オーバービュー）のみグラフを大きく */
const GRAPH_SECTION_HEIGHT_SP_OVERVIEW = "min(88vh, 720px)";
/** 1画面に1セグメントのみ表示するため、各ステップをビューポート高に揃える（SP: 65vh / PC: 100vh で1セグメントに制限） */
const STEP_VIEWPORT_HEIGHT_SP = "65vh";
const STEP_VIEWPORT_HEIGHT_PC = "100vh";
/** SP版でテキストをグラフ下端に重ねる量（フェード帯の高さ） */
const SP_FADE_OVERLAP_PX = 96;
/** Scrollama: ステップが「入った」とみなすビューポート上の位置 (0–1)。0.99 で段落が画面下端付近に入った時点でグラフが切り替わり、見ている段落と一致する */
const SCROLLAMA_OFFSET = 0.99;

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
  const [innerWidth] = useWindowSize();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progressStepIndex, setProgressStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 400, height: GRAPH_MIN_HEIGHT });
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [isFreeExploreMode, setIsFreeExploreMode] = useState(false);
  const frozenGraphIndexRef = useRef(0);
  /** ボタンで次へ送る際、スクロール計算前に通常高さでレイアウトさせるためのフラグ */
  const [useNormalHeightForScroll, setUseNormalHeightForScroll] = useState(false);

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
      ([entry]) => setTopSentinelInView(entry?.isIntersecting ?? false),
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

  // トップを離れたときだけ useNormalHeightForScroll を false に戻す（scrollToTop でトップに来た場合は true のままにしてレイアウト変化を防ぐ）
  useEffect(() => {
    if (!topSentinelInView) {
      setUseNormalHeightForScroll(false);
    }
  }, [topSentinelInView]);

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
    setCurrentStepIndex(index);
    setProgressStepIndex(index);
    setStepProgress(0);
  }, []);

  const onStepProgress = useCallback((arg: ScrollamaProgressCallbackArg) => {
    const index = Number(arg.data);
    const progress = Math.max(0, Math.min(1, arg.progress));
    setProgressStepIndex(index);
    setStepProgress(progress);
  }, []);

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
    (communityId: string) => {
      const index = steps.findIndex(
        (s) => s.communityId === communityId && s.id !== "__overview__",
      );
      if (index < 0) return;
      // 1つ手前の要素にスクロールすると scroll-snap で先頭セグメントに収まる
      const targetIndex = Math.max(0, index - 1);
      const selector = `[data-story-step-index="${targetIndex}"]`;
      setUseNormalHeightForScroll(true);
      // 高さを通常にしたうえでレイアウトが更新されてからスクロールする（スナップ目標が正しく計算される）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector(selector);
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
          window.setTimeout(() => setUseNormalHeightForScroll(false), 500);
        });
      });
    },
    [steps],
  );

  const scrollToTop = useCallback(() => {
    setUseNormalHeightForScroll(true);
    // 高さを通常にしたうえでレイアウトが更新されてからスクロールする（スナップ目標が正しく計算され、iOS実機で戻り抜けしない）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        topSentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        // トップにいる間は高さを変えず、ユーザーが下にスクロールしてトップを離れたときだけ false に戻す（useEffect で実施）
      });
    });
  }, []);

  const scrollToNextSegment = useCallback(() => {
    if (steps.length < 2) return;
    setUseNormalHeightForScroll(true);
    const selector = `[data-story-step-index="0"]`;
    // 高さを通常にしたうえでレイアウトが更新されてからスクロールする（スナップ目標が正しく計算される）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(selector);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(() => setUseNormalHeightForScroll(false), 500);
      });
    });
  }, [steps.length]);

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
        height:
          isPc
            ? GRAPH_SECTION_HEIGHT_PC
            : displayStep?.id === "__overview__" && !useNormalHeightForScroll
              ? GRAPH_SECTION_HEIGHT_SP_OVERVIEW
              : GRAPH_SECTION_HEIGHT_SP,
        width: "100%",
      }}
    >

      <StorytellingGraphUnified
        key="storytelling-graph-unified"
        graphDocument={graphDocument}
        focusNodeIds={graphNodeIds}
        focusEdgeIds={graphEdgeIds}
        animationProgress={animationProgress}
        width={graphSize.width}
        height={graphSize.height}
        filter={metaGraphData.filter}
        freeExploreMode={isFreeExploreMode}
        isPc={isPc}
        communityMap={metaGraphData.communityMap}
        narrativeFlow={metaGraphData.narrativeFlow}
        showFullGraph={displayStep?.id === "__overview__"}
        communityTitles={Object.fromEntries(
          (metaGraphData.summaries ?? []).map((s) => [s.communityId, s.title]),
        )}
        onCommunityTitleClick={goToFirstSegmentOfCommunity}
      />


      <div className="fixed bottom-4 right-4 z-10 flex items-center gap-2">
        {displayStep?.id !== "__overview__" && (
          <button
            type="button"
            onClick={scrollToTop}
            className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-700/90 text-slate-200 shadow hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
            aria-label="ページトップ（タイトル）へ戻る"
            title="ページトップ（タイトル）へ戻る"
          >
            <UpArrowIcon width={18} height={18} color="currentColor" />
          </button>
        )}
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
              <div className="sticky flex w-2/3 top-0 shrink-0 flex-col self-start h-screen justify-center">
                {graphSection}
              </div>
              <div className="min-w-0 flex-1 w-1/3">
                {progressStep?.communityTitle != null && progressStep.communityTitle !== "" && (
                  <div
                    className={`sticky top-72 z-10 w-full pb-2 pt-0 font-semibold text-white ${progressStep?.id === "__overview__" ? "text-4xl" : "text-xl"}`}
                  >
                    {progressStep.communityTitle}
                  </div>
                )}
                <Scrollama
                  offset={SCROLLAMA_OFFSET}
                  onStepEnter={onStepEnter}
                  onStepProgress={onStepProgress}
                  threshold={8}
                >
                  {steps.map((step, index) => {
                    const focusNodeWithImage = graphDocument?.nodes?.find(
                      (n) =>
                        step.nodeIds.includes(n.id) &&
                        (n.properties as { imageUrl?: string })?.imageUrl,
                    );
                    const nodeImageUrl = focusNodeWithImage?.properties
                      ? (focusNodeWithImage.properties as { imageUrl?: string }).imageUrl
                      : undefined;
                    return (
                      <Step data={index} key={step.id}>
                        <div
                          data-story-step-index={index}
                          className="flex snap-start flex-col justify-center pr-4 [scroll-snap-stop:always]"
                          style={{
                            height: STEP_VIEWPORT_HEIGHT_PC,
                            minHeight: STEP_VIEWPORT_HEIGHT_PC,
                          }}
                        >
                          <SegmentFadeIn>
                            {nodeImageUrl && (
                              <div className="mb-4 max-w-sm">
                                {/* eslint-disable-next-line @next/next/no-img-element -- node image URL is dynamic (Supabase storage) */}
                                <img
                                  src={nodeImageUrl}
                                  alt={
                                    (focusNodeWithImage?.properties as { imageAlt?: string })?.imageAlt ??
                                    focusNodeWithImage?.name ??
                                    ""
                                  }
                                  className="rounded object-cover shadow-md"
                                />
                                {(focusNodeWithImage?.properties as { imageCaption?: string })?.imageCaption && (
                                  <p className="mt-1 text-sm text-slate-400">
                                    {(focusNodeWithImage?.properties as { imageCaption?: string }).imageCaption}
                                  </p>
                                )}
                              </div>
                            )}
                            <p
                              className={
                                step.isTransition
                                  ? "whitespace-pre-wrap text-center text-sm italic leading-relaxed text-slate-400"
                                  : "whitespace-pre-wrap text-left text-slate-200 leading-relaxed"
                              }
                            >
                              {step.text || " "}
                            </p>
                          </SegmentFadeIn>
                        </div>
                      </Step>
                    );
                  })}
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
                        ? "fixed bottom-24 left-4 right-4 z-10 font-semibold text-white text-3xl text-center"
                        : "fixed -mt-20 z-10 pb-2 pt-0 font-semibold text-white text-lg"
                    }
                  >
                    {progressStep.communityTitle}
                  </div>
                )}
                {progressStep?.id === "__overview__" && (
                  <button
                    type="button"
                    onClick={scrollToNextSegment}
                    className="fixed bottom-6 left-4 right-4 z-10 flex flex-col items-center gap-1.5 text-slate-300/75 transition-opacity hover:opacity-100 hover:text-slate-200 cursor-pointer"
                    aria-label="次のセグメントへスクロール"
                  >
                    <span className="text-xs font-medium">スクロールして続きを見る</span>
                    <span className="animate-bounce">
                      <DownArrowIcon width={24} height={24} color="currentColor" />
                    </span>
                  </button>
                )}
                <Scrollama
                  offset={SCROLLAMA_OFFSET}
                  onStepEnter={onStepEnter}
                  onStepProgress={onStepProgress}
                  threshold={8}
                >
                  {steps.map((step, index) => {
                    const focusNodeWithImage = graphDocument?.nodes?.find(
                      (n) =>
                        step.nodeIds.includes(n.id) &&
                        (n.properties as { imageUrl?: string })?.imageUrl,
                    );
                    const nodeImageUrl = focusNodeWithImage?.properties
                      ? (focusNodeWithImage.properties as { imageUrl?: string }).imageUrl
                      : undefined;
                    return (
                      <Step data={index} key={step.id}>
                        <div
                          data-story-step-index={index}
                          className="snap-start py-6 [scroll-snap-stop:always]"
                          style={{
                            height: STEP_VIEWPORT_HEIGHT_SP,
                            minHeight: STEP_VIEWPORT_HEIGHT_SP,
                          }}
                        >
                          <SegmentFadeIn>
                            {nodeImageUrl && (
                              <div className="mb-4 max-w-sm">
                                {/* eslint-disable-next-line @next/next/no-img-element -- node image URL is dynamic (Supabase storage) */}
                                <img
                                  src={nodeImageUrl}
                                  alt={
                                    (focusNodeWithImage?.properties as { imageAlt?: string })?.imageAlt ??
                                    focusNodeWithImage?.name ??
                                    ""
                                  }
                                  className="rounded object-cover shadow-md"
                                />
                                {(focusNodeWithImage?.properties as { imageCaption?: string })?.imageCaption && (
                                  <p className="mt-1 text-sm text-slate-400">
                                    {(focusNodeWithImage?.properties as { imageCaption?: string }).imageCaption}
                                  </p>
                                )}
                              </div>
                            )}
                            <p
                              className={
                                step.isTransition
                                  ? "whitespace-pre-wrap text-center text-sm italic leading-relaxed text-slate-400"
                                  : "whitespace-pre-wrap text-left text-slate-200 leading-relaxed"
                              }
                            >
                              {step.text || " "}
                            </p>
                          </SegmentFadeIn>
                        </div>
                      </Step>
                    );
                  })}
                </Scrollama>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
