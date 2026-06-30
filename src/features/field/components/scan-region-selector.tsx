"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/app/_components/button/button";
import { CrossLargeIcon, RotateCounterClockwiseIcon } from "@/app/_components/icons";
import { ScanImageWithRegions } from "@/features/field/components/scan-image-with-regions";
import {
  clientPointToNormalized,
  cornerToRegionStyle,
  createOffsetDefaultRegion,
  DEFAULT_OCR_REGION,
  getDisplayedImageLayout,
  moveRegion,
  regionToOverlayStyle,
  updateRegionCorner,
  type DisplayedImageLayout,
  type NormalizedOcrRegion,
  type RegionCorner,
} from "@/features/field/ocr/region-types";

type ScanRegionSelectorProps = {
  imageUrl: string;
  regions: NormalizedOcrRegion[];
  onRegionsChange: (regions: NormalizedOcrRegion[]) => void;
  defaultFullscreen?: boolean;
  requireFullscreenChangeToComplete?: boolean;
  onCancelFullscreen?: () => void;
  onCompleteFullscreen?: () => void;
  onRotateImage?: () => void;
  isRotatingImage?: boolean;
};

type ScanRegionSelectorCanvasProps = {
  imageUrl: string;
  regions: NormalizedOcrRegion[];
  onRegionsChange: (regions: NormalizedOcrRegion[]) => void;
  containerClassName: string;
};

type DragState =
  | {
    kind: "corner";
    regionIndex: number;
    corner: RegionCorner;
  }
  | {
    kind: "move";
    regionIndex: number;
    startPoint: { x: number; y: number };
    startRegion: NormalizedOcrRegion;
  };

const CORNERS: RegionCorner[] = ["tl", "tr", "br", "bl"];

type RegionControlsProps = {
  regions: NormalizedOcrRegion[];
  onRegionsChange: (regions: NormalizedOcrRegion[]) => void;
  onRotateImage?: () => void;
  isRotatingImage?: boolean;
};

function ImageRotateButton({
  onRotateImage,
  isRotatingImage,
}: Pick<RegionControlsProps, "onRotateImage" | "isRotatingImage">) {
  const t = useTranslations("field");
  if (!onRotateImage) return null;

  return (
    <Button
      onClick={onRotateImage}
      disabled={isRotatingImage}
      isLoading={isRotatingImage}
      className="!h-9 !w-9 !bg-slate-700 !p-2 !pl-2.5 text-white"
      size="small"
      aria-label={t("rotateImage90")}
    >
      <RotateCounterClockwiseIcon width={18} height={18} color="white" />
    </Button>
  );
}

function RegionControls({
  regions,
  onRegionsChange,
  onRotateImage,
  isRotatingImage,
}: RegionControlsProps) {
  const t = useTranslations("field");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ImageRotateButton
          onRotateImage={onRotateImage}
          isRotatingImage={isRotatingImage}
        />
        <Button
          onClick={() =>
            onRegionsChange([
              ...regions,
              createOffsetDefaultRegion(regions.length),
            ])
          }
          className="bg-slate-700 px-2 py-1 text-xs text-white"
          size="small"
        >
          {t("addRegion")}
        </Button>
        <Button
          onClick={() => onRegionsChange([DEFAULT_OCR_REGION])}
          className="bg-slate-700 px-2 py-1 text-xs text-white"
          size="small"
        >
          {t("resetRegions")}
        </Button>
        {regions.length > 1 && (
          <Button
            onClick={() => onRegionsChange(regions.slice(0, -1))}
            className="bg-slate-700 px-2 py-1 text-xs text-white"
            size="small"
          >
            {t("removeLastRegion")}
          </Button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {t("regionCount", { count: regions.length })}
      </p>
    </>
  );
}

function ScanRegionSelectorCanvas({
  imageUrl,
  regions,
  onRegionsChange,
  containerClassName,
}: ScanRegionSelectorCanvasProps) {
  const t = useTranslations("field");
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<DisplayedImageLayout | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const dragStateRef = useRef<DragState | null>(null);
  const activePointerId = useRef<number | null>(null);

  const cornerLabels = useMemo(
    (): Record<RegionCorner, string> => ({
      tl: t("cornerTopLeft"),
      tr: t("cornerTopRight"),
      br: t("cornerBottomRight"),
      bl: t("cornerBottomLeft"),
    }),
    [t],
  );

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

  const updateRegionAt = (index: number, region: NormalizedOcrRegion) => {
    const nextRegions = [...regions];
    nextRegions[index] = region;
    onRegionsChange(nextRegions);
  };

  const getNormalizedPoint = (clientX: number, clientY: number) => {
    if (!layout || !containerRef.current) return null;

    return clientPointToNormalized(
      clientX,
      clientY,
      containerRef.current.getBoundingClientRect(),
      layout,
    );
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLElement>,
    dragState: DragState,
  ) => {
    if (!layout || !overlayRef.current) return;

    event.preventDefault();
    activePointerId.current = event.pointerId;
    dragStateRef.current = dragState;
    overlayRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (
      activePointerId.current !== event.pointerId ||
      !dragState ||
      !layout
    ) {
      return;
    }

    const point = getNormalizedPoint(event.clientX, event.clientY);
    if (!point) return;

    if (dragState.kind === "corner") {
      const region = regions[dragState.regionIndex];
      if (!region) return;

      updateRegionAt(
        dragState.regionIndex,
        updateRegionCorner(region, dragState.corner, point),
      );
      return;
    }

    const delta = {
      dx: point.x - dragState.startPoint.x,
      dy: point.y - dragState.startPoint.y,
    };
    updateRegionAt(
      dragState.regionIndex,
      moveRegion(dragState.startRegion, delta),
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== event.pointerId) return;

    dragStateRef.current = null;
    activePointerId.current = null;
    if (overlayRef.current?.hasPointerCapture(event.pointerId)) {
      overlayRef.current.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div ref={containerRef} className={containerClassName}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={t("ocrRegionSelectAlt")}
        className="absolute inset-0 h-full w-full object-contain"
        onLoad={handleImageLoad}
        draggable={false}
      />

      {layout && (
        <div
          ref={overlayRef}
          className="absolute inset-0 touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {regions.map((region, index) => (
            <div
              key={`region-${index}`}
              className="absolute border-2 border-orange-400 bg-orange-400/20"
              style={regionToOverlayStyle(region, layout)}
            >
              <button
                type="button"
                aria-label={t("moveRegion", { index: index + 1 })}
                className="absolute inset-0 cursor-move touch-none"
                onPointerDown={(event) => {
                  const point = getNormalizedPoint(
                    event.clientX,
                    event.clientY,
                  );
                  if (!point) return;

                  handlePointerDown(event, {
                    kind: "move",
                    regionIndex: index,
                    startPoint: point,
                    startRegion: region,
                  });
                }}
              />

              <span className="pointer-events-none absolute left-1 top-1 rounded bg-orange-500/90 px-1 text-[10px] text-white">
                {index + 1}
              </span>

              {CORNERS.map((corner) => (
                <button
                  key={`${index}-${corner}`}
                  type="button"
                  aria-label={t("regionCornerAria", {
                    index: index + 1,
                    corner: cornerLabels[corner],
                  })}
                  className="absolute z-10 h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing"
                  style={cornerToRegionStyle(corner)}
                  onPointerDown={(event) => {
                    handlePointerDown(event, {
                      kind: "corner",
                      regionIndex: index,
                      corner,
                    });
                  }}
                >
                  <span className="absolute left-1/2 top-1/2 block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-orange-500 shadow-md" />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScanRegionSelector({
  imageUrl,
  regions,
  onRegionsChange,
  defaultFullscreen = false,
  requireFullscreenChangeToComplete = false,
  onCancelFullscreen,
  onCompleteFullscreen,
  onRotateImage,
  isRotatingImage = false,
}: ScanRegionSelectorProps) {
  const t = useTranslations("field");
  const [isFullscreen, setIsFullscreen] = useState(defaultFullscreen);
  const [isMounted, setIsMounted] = useState(false);
  const [fullscreenBaseline, setFullscreenBaseline] = useState<
    NormalizedOcrRegion[] | null
  >(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setIsFullscreen(defaultFullscreen);
  }, [defaultFullscreen, imageUrl]);

  useEffect(() => {
    if (!isFullscreen) return;
    setFullscreenBaseline(regions.map((region) => ({ ...region })));
  }, [isFullscreen, imageUrl]);

  const hasFullscreenChanges = useMemo(() => {
    if (!fullscreenBaseline) return false;
    if (fullscreenBaseline.length !== regions.length) return true;
    return fullscreenBaseline.some((region, index) => {
      const current = regions[index];
      if (!current) return true;
      return (
        region.x !== current.x ||
        region.y !== current.y ||
        region.w !== current.w ||
        region.h !== current.h
      );
    });
  }, [fullscreenBaseline, regions]);

  const handleCancelFullscreen = () => {
    if (fullscreenBaseline) {
      onRegionsChange(fullscreenBaseline.map((region) => ({ ...region })));
    }
    setIsFullscreen(false);
    onCancelFullscreen?.();
  };

  const handleCompleteFullscreen = () => {
    setIsFullscreen(false);
    onCompleteFullscreen?.();
  };

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  const canvasProps = {
    imageUrl,
    regions,
    onRegionsChange,
  };

  const fullscreenOverlay =
    isFullscreen && isMounted
      ? createPortal(
        <div
          className="fixed inset-0 z-50 flex flex-col bg-slate-950"
          role="dialog"
          aria-modal="true"
          aria-label={t("fullscreenRegionDialog")}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCancelFullscreen}
                className="!h-8 !w-8 !bg-transparent !p-2 hover:!bg-slate-50/10"
                size="small"
              >
                <CrossLargeIcon width={16} height={16} color="white" />
              </Button>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  {t("selectTextRegion")}
                </h3>
                <p className="mt-1 text-xs text-slate-400">{t("regionHelpText")}</p>
              </div>
            </div>
            <Button
              onClick={handleCompleteFullscreen}
              className="!h-9 shrink-0 bg-slate-700 px-3 text-xs text-white"
              size="small"
              disabled={
                requireFullscreenChangeToComplete && !hasFullscreenChanges
              }
            >
              {t("done")}
            </Button>
          </div>

          <div className="min-h-0 flex-1 px-3 py-3">
            <ScanRegionSelectorCanvas
              {...canvasProps}
              containerClassName="relative h-full w-full overflow-hidden rounded-lg bg-slate-900"
            />
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-slate-800 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <RegionControls
              regions={regions}
              onRegionsChange={onRegionsChange}
              onRotateImage={onRotateImage}
              isRotatingImage={isRotatingImage}
            />
          </div>
        </div>,
        document.body,
      )
      : null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-400">
          {isFullscreen ? t("regionHelpText") : t("regionViewText")}
        </p>
        {!isFullscreen && (
          <Button
            onClick={() => setIsFullscreen(true)}
            className="shrink-0 bg-slate-700 px-2 py-1 text-sm text-white"
            size="small"
          >
            {t("adjustRegion")}
          </Button>
        )}
      </div>

      {!isFullscreen && (
        <ScanImageWithRegions
          imageUrl={imageUrl}
          regions={regions}
          alt={t("ocrRegionPreviewAlt")}
        />
      )}

      {isFullscreen && (
        <div className="relative aspect-[3/4] max-h-80 w-full overflow-hidden rounded-lg border border-dashed border-slate-700 bg-slate-900/50">
          <ScanImageWithRegions
            imageUrl={imageUrl}
            regions={regions}
            alt={t("ocrRegionPreviewAlt")}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/40 text-xs text-slate-200">
            {t("fullscreenAdjusting")}
          </span>
        </div>
      )}

      {fullscreenOverlay}
    </div>
  );
}
