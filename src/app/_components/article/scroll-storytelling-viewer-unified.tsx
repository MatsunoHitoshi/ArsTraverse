"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { MetaGraphStoryData } from "@/app/_hooks/use-meta-graph-story";
import { Scrollama, Step } from "react-scrollama";
import type { ScrollamaStepCallbackArg, ScrollamaProgressCallbackArg } from "react-scrollama";
import { StorytellingGraphUnified } from "../d3/force/storytelling-graph-unified";
import { buildScrollStepsFromMetaGraphStoryData } from "@/app/_utils/story-scroll-utils";
import { useWindowSize } from "@/app/_hooks/use-window-size";
import { Crosshair1Icon, ResetIcon } from "../icons/icons";

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
const GRAPH_SECTION_HEIGHT_PC = "min(70vh, 560px)";
const GRAPH_SECTION_HEIGHT_SP = "min(72vh, 600px)";
/** 1画面に1セグメントのみ表示するため、各ステップをビューポート高に揃える */
const STEP_VIEWPORT_HEIGHT = "65vh";
/** SP版でテキストをグラフ下端に重ねる量（フェード帯の高さ） */
const SP_FADE_OVERLAP_PX = 96;
/** Scrollama: ステップが「入った」とみなすビューポート上の位置 (0–1)。0.99 で段落が画面下端付近に入った時点でグラフが切り替わり、見ている段落と一致する */
const SCROLLAMA_OFFSET = 0.99;

export interface ScrollStorytellingViewerUnifiedProps {
  graphDocument: GraphDocumentForFrontend;
  metaGraphData: MetaGraphStoryData;
}

export function ScrollStorytellingViewerUnified({
  graphDocument,
  metaGraphData,
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

  const steps = useMemo(
    () => buildScrollStepsFromMetaGraphStoryData(metaGraphData),
    [metaGraphData],
  );

  const { nodeIds: allStoryNodeIds, edgeIds: allStoryEdgeIds } = useMemo(
    (): { nodeIds: string[]; edgeIds: string[] } => {
      const nodeIdSet = new Set<string>();
      const edgeIdSet = new Set<string>();
      for (const step of steps) {
        for (const id of step.nodeIds) nodeIdSet.add(id);
        for (const id of step.edgeIds) edgeIdSet.add(id);
      }
      return {
        nodeIds: Array.from(nodeIdSet),
        edgeIds: Array.from(edgeIdSet),
      };
    },
    [steps],
  );

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

  const graphNodeIds = displayStep?.nodeIds ?? [];
  const graphEdgeIds = displayStep?.edgeIds ?? [];
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
        width: isPc ? "min(100%, 520px)" : "100%",
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
        showBottomFadeGradient={!isPc}
      />
      <button
        type="button"
        onClick={toggleFreeExplore}
        className="fixed bottom-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-slate-700/90 text-slate-200 shadow hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
        aria-label={isFreeExploreMode ? "自由探索を終了" : "自由探索モード"}
        title={isFreeExploreMode ? "自由探索を終了" : "グラフを自由にズーム・移動"}
      >
        {isFreeExploreMode ? (
          <ResetIcon width={16} height={16} color="currentColor" />
        ) : (
          <Crosshair1Icon width={16} height={16} color="currentColor" />
        )}
      </button>
    </div>
  );

  const segmentIndicator =
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed right-1.5 top-1/2 z-[100] flex -translate-y-1/2 flex-col items-center gap-1.5"
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
      <div className="relative w-full max-w-6xl">
        <div
          ref={topSentinelRef}
          className="snap-start"
          style={{ height: 1, minHeight: 1 }}
          aria-hidden="true"
        />
        <div
          className={
            isPc
              ? "flex flex-row gap-8"
              : "flex flex-col gap-6"
          }
        >
          {isPc ? (
            <>
              <div className="sticky top-24 flex w-[420px] shrink-0 flex-col self-start">
                {graphSection}
              </div>
              <div className="min-w-0 flex-1">
                {progressStep?.communityTitle != null && progressStep.communityTitle !== "" && (
                  <div className="sticky top-0 z-10 bg-slate-900 pb-2 pt-0 text-sm font-medium text-slate-400">
                    {progressStep.communityTitle}
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
                      <div
                        className="snap-start py-8 pr-4 [scroll-snap-stop:always]"
                        style={{
                          height: STEP_VIEWPORT_HEIGHT,
                          minHeight: STEP_VIEWPORT_HEIGHT,
                        }}
                      >
                        <SegmentFadeIn>
                          <p className="whitespace-pre-wrap text-left text-slate-200 leading-relaxed">
                            {step.text || " "}
                          </p>
                        </SegmentFadeIn>
                      </div>
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
                  <div className="fixed -mt-20 z-10 pb-2 pt-0 text-lg font-semibold text-white">
                    {progressStep.communityTitle}
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
                      <div
                        className="snap-start py-6 [scroll-snap-stop:always]"
                        style={{
                          height: STEP_VIEWPORT_HEIGHT,
                          minHeight: STEP_VIEWPORT_HEIGHT,
                        }}
                      >
                        <SegmentFadeIn>
                          <p className="whitespace-pre-wrap text-left text-slate-200 leading-relaxed">
                            {step.text || " "}
                          </p>
                        </SegmentFadeIn>
                      </div>
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
