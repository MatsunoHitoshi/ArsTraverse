"use client";

import React, { useRef, useState, useEffect, useMemo, forwardRef } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { ScrollStep } from "@/app/_utils/story-scroll-utils";

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

export const StoryStepContent = forwardRef<
  HTMLDivElement,
  {
    step: ScrollStep;
    index: number;
    graphDocument: GraphDocumentForFrontend;
    className?: string;
    style?: React.CSSProperties;
  }
>(function StoryStepContent(
  {
    step,
    index,
    graphDocument,
    className,
    style,
  },
  ref,
) {
  const focusNodeWithImage = useMemo(
    () =>
      graphDocument?.nodes?.find(
        (n) =>
          step.nodeIds.includes(n.id) &&
          (n.properties as { imageUrl?: string })?.imageUrl,
      ),
    [graphDocument?.nodes, step.nodeIds],
  );

  const nodeImageUrl = focusNodeWithImage?.properties
    ? (focusNodeWithImage.properties as { imageUrl?: string }).imageUrl
    : undefined;

  return (
    <div
      ref={ref}
      data-story-step-index={index}
      className={className}
      style={style}
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
  );
});
