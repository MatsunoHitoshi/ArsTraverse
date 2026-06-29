"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  getDisplayedImageLayout,
  regionToOverlayStyle,
  type NormalizedOcrRegion,
} from "@/features/field/ocr/region-types";

type ScanImageWithRegionsProps = {
  imageUrl: string;
  regions?: NormalizedOcrRegion[];
  alt?: string;
};

export function ScanImageWithRegions({
  imageUrl,
  regions = [],
  alt,
}: ScanImageWithRegionsProps) {
  const t = useTranslations("field");
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [layout, setLayout] = useState<ReturnType<
    typeof getDisplayedImageLayout
  > | null>(null);
  const imageAlt = alt ?? t("scanImageAlt");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || naturalSize.width === 0) return;

    const update = () => {
      const rect = container.getBoundingClientRect();
      setLayout(
        getDisplayedImageLayout(
          rect.width,
          rect.height,
          naturalSize.width,
          naturalSize.height,
        ),
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [naturalSize.height, naturalSize.width]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl bg-slate-900"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={imageAlt}
        className="block max-h-72 w-full object-contain"
        onLoad={(event) => {
          setNaturalSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          });
        }}
      />
      {layout &&
        regions.map((region, index) => (
          <div
            key={`saved-region-${index}`}
            className="pointer-events-none absolute border-2 border-orange-400/80 bg-orange-400/15"
            style={regionToOverlayStyle(region, layout)}
          >
            <span className="absolute left-1 top-1 rounded bg-orange-500/90 px-1 text-[10px] text-white">
              {index + 1}
            </span>
          </div>
        ))}
    </div>
  );
}
