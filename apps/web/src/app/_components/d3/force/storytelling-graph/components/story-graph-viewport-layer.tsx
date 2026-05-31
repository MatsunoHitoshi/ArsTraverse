import type React from "react";
import { D3ZoomProvider } from "../../../zoom";

export function StoryGraphViewportLayer({
  freeExploreMode,
  svgRef,
  zoomScale,
  zoomX,
  zoomY,
  setZoomScale,
  setZoomX,
  setZoomY,
  children,
}: {
  freeExploreMode: boolean;
  svgRef: React.RefObject<SVGSVGElement | null>;
  zoomScale: number;
  zoomX: number;
  zoomY: number;
  setZoomScale: React.Dispatch<React.SetStateAction<number>>;
  setZoomX: React.Dispatch<React.SetStateAction<number>>;
  setZoomY: React.Dispatch<React.SetStateAction<number>>;
  children: React.ReactNode;
}) {
  if (!freeExploreMode) {
    return <>{children}</>;
  }

  return (
    <D3ZoomProvider
      svgRef={svgRef as React.RefObject<SVGSVGElement>}
      currentScale={zoomScale}
      setCurrentScale={setZoomScale}
      currentTransformX={zoomX}
      setCurrentTransformX={setZoomX}
      currentTransformY={zoomY}
      setCurrentTransformY={setZoomY}
    >
      {children}
    </D3ZoomProvider>
  );
}
