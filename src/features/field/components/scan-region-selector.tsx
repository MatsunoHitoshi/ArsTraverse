"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/app/_components/button/button";
import {
  clientPointToNormalized,
  DEFAULT_OCR_REGION,
  getDisplayedImageLayout,
  normalizedRectFromPoints,
  regionToOverlayStyle,
  type DisplayedImageLayout,
  type NormalizedOcrRegion,
} from "@/features/field/ocr/region-types";

type ScanRegionSelectorProps = {
  imageUrl: string;
  regions: NormalizedOcrRegion[];
  onRegionsChange: (regions: NormalizedOcrRegion[]) => void;
};

type DraftRect = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export function ScanRegionSelector({
  imageUrl,
  regions,
  onRegionsChange,
}: ScanRegionSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<DisplayedImageLayout | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<DraftRect | null>(null);
  const [addMode, setAddMode] = useState(false);
  const activePointerId = useRef<number | null>(null);

  const updateLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container || naturalSize.width === 0) return;

    const rect = container.getBoundingClientRect();
    setLayout(
      getDisplayedImageLayout(
        rect.width,
        rect.height,
        naturalSize.width,
        naturalSize.height,
      ),
    );
  }, [naturalSize.height, naturalSize.width]);

  useEffect(() => {
    updateLayout();
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(updateLayout);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateLayout]);

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    if (regions.length === 0) {
      onRegionsChange([DEFAULT_OCR_REGION]);
    }
  };

  const commitDraft = (nextDraft: DraftRect) => {
    const region = normalizedRectFromPoints(nextDraft.start, nextDraft.end);
    if (!region) return;

    if (addMode || regions.length === 0) {
      onRegionsChange([...regions, region]);
      setAddMode(false);
      return;
    }

    onRegionsChange([region]);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!layout || !containerRef.current) return;

    const point = clientPointToNormalized(
      event.clientX,
      event.clientY,
      containerRef.current.getBoundingClientRect(),
      layout,
    );
    if (!point) return;

    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({ start: point, end: point });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      activePointerId.current !== event.pointerId ||
      !draft ||
      !layout ||
      !containerRef.current
    ) {
      return;
    }

    const point = clientPointToNormalized(
      event.clientX,
      event.clientY,
      containerRef.current.getBoundingClientRect(),
      layout,
    );
    if (!point) return;

    setDraft({ ...draft, end: point });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== event.pointerId || !draft) return;

    commitDraft(draft);
    setDraft(null);
    activePointerId.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const draftRegion =
    draft && layout
      ? normalizedRectFromPoints(draft.start, draft.end)
      : null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-xs text-slate-400">
        文字部分を指でドラッグして囲んでください。最初は中央に候補領域を表示しています。
      </p>

      <div
        ref={containerRef}
        className="relative aspect-[3/4] max-h-80 w-full overflow-hidden rounded-lg bg-slate-900"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="OCR 領域選択"
          className="absolute inset-0 h-full w-full object-contain"
          onLoad={handleImageLoad}
          draggable={false}
        />

        <div
          className="absolute inset-0 touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {layout &&
            regions.map((region, index) => (
              <div
                key={`region-${index}`}
                className="pointer-events-none absolute border-2 border-orange-400 bg-orange-400/20"
                style={regionToOverlayStyle(region, layout)}
              >
                <span className="absolute left-1 top-1 rounded bg-orange-500/90 px-1 text-[10px] text-white">
                  {index + 1}
                </span>
              </div>
            ))}

          {layout && draftRegion && (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-sky-300 bg-sky-300/15"
              style={regionToOverlayStyle(draftRegion, layout)}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => setAddMode(true)}
          className="bg-slate-700 px-2 py-1 text-xs text-white"
          size="small"
        >
          ＋ 領域を追加
        </Button>
        <Button
          onClick={() => onRegionsChange([DEFAULT_OCR_REGION])}
          className="bg-slate-700 px-2 py-1 text-xs text-white"
          size="small"
        >
          候補をリセット
        </Button>
        {regions.length > 1 && (
          <Button
            onClick={() => onRegionsChange(regions.slice(0, -1))}
            className="bg-slate-700 px-2 py-1 text-xs text-white"
            size="small"
          >
            最後の領域を削除
          </Button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        領域 {regions.length} 件
        {addMode ? " · 次のドラッグで領域を追加します" : " · ドラッグで領域を置き換え"}
      </p>
    </div>
  );
}
