"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { MetaGraphStoryData } from "@/app/_hooks/use-meta-graph-story";
import { Scrollama, Step } from "react-scrollama";
import type { ScrollamaStepCallbackArg, ScrollamaProgressCallbackArg } from "react-scrollama";
import { StorytellingGraph } from "../d3/force/storytelling-graph";
import {
  buildScrollStepsFromMetaGraphStoryData,
} from "@/app/_utils/story-scroll-utils";
import { useWindowSize } from "@/app/_hooks/use-window-size";

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

export interface ScrollStorytellingViewerProps {
  graphDocument: GraphDocumentForFrontend;
  metaGraphData: MetaGraphStoryData;
}

export function ScrollStorytellingViewer({
  graphDocument,
  metaGraphData,
}: ScrollStorytellingViewerProps) {
  const [innerWidth] = useWindowSize();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progressStepIndex, setProgressStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const prevGraphKeyRef = useRef<string | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 400, height: GRAPH_MIN_HEIGHT });
  const topSentinelRef = useRef<HTMLDivElement>(null);

  const steps = useMemo(
    () => buildScrollStepsFromMetaGraphStoryData(metaGraphData),
    [metaGraphData],
  );

  const isPc = (innerWidth ?? 0) >= XL_BREAKPOINT;

  // 先頭センチネルがビューポート内なら1段落目とみなす（初期表示・トップへスクロール時）
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

  // セグメントごとの Scroll Snap: マウント時に html に適用、アンマウントで解除
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

  // 先頭センチネルがビュー内なら1段落目。それ以外は Scrollama の step に従う
  const graphIndex =
    topSentinelInView
      ? 0
      : Math.max(
        0,
        Math.min(progressStepIndex, steps.length - 1),
      );
  const progressStep = steps[graphIndex];

  const graphNodeIds = progressStep?.nodeIds ?? [];
  const graphEdgeIds = progressStep?.edgeIds ?? [];
  const animationProgress =
    topSentinelInView
      ? 1
      : progressStepIndex === currentStepIndex
        ? stepProgress
        : progressStepIndex < currentStepIndex
          ? 1
          : 0;

  if (steps.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-400">
        表示するストーリーがありません
      </div>
    );
  }

  const graphKey = progressStep?.id ?? `step-${graphIndex}`;

  // 検証: graphKey が変わったときだけ。表示中の段落テキストと step が一致しているか確認用
  if (prevGraphKeyRef.current !== graphKey) {
    prevGraphKeyRef.current = graphKey;
    const textPreview = progressStep?.text?.slice(0, 60) ?? "";
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
      <StorytellingGraph
        key={graphKey}
        graphDocument={graphDocument}
        focusNodeIds={graphNodeIds}
        focusEdgeIds={graphEdgeIds}
        animationProgress={animationProgress}
        width={graphSize.width}
        height={graphSize.height}
        filter={metaGraphData.filter}
      />
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
        {/* ページ最上部をスナップ対象にし、1段落目へスクロールできるようにする */}
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
