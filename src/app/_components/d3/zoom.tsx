import type { ZoomBehavior } from "d3";
import React, { useEffect } from "react";
import { select, zoom } from "d3";
import { FocusedPosition } from "@/app/const/types";

type D3ZoomProvider = {
  setCurrentScale: React.Dispatch<React.SetStateAction<number>>;
  setCurrentTransformX: React.Dispatch<React.SetStateAction<number>>;
  setCurrentTransformY: React.Dispatch<React.SetStateAction<number>>;
  currentScale: number;
  currentTransformX: number;
  currentTransformY: number;
  children: React.ReactNode;
  svgRef: React.RefObject<SVGSVGElement>;
};

export const D3ZoomProvider = ({
  setCurrentScale,
  setCurrentTransformX,
  setCurrentTransformY,
  currentScale,
  currentTransformX,
  currentTransformY,
  children,
  svgRef,
}: D3ZoomProvider) => {
  useEffect(() => {
    if (!svgRef.current) return;
    // const zoomScreen = select<Element, unknown>("#container");
    const svgScreen = select<SVGSVGElement, unknown>(svgRef.current);
    const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<
      SVGSVGElement,
      unknown
    >()
      .scaleExtent([0.1, 10])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        const k = event.transform.k;
        const x = event.transform.x;
        const y = event.transform.y;
        setCurrentScale(k);
        setCurrentTransformX(x);
        setCurrentTransformY(y);
      });

    svgScreen.call(zoomBehavior);
  }, []);

  return (
    <g
      transform={`translate(${currentTransformX}, ${currentTransformY})scale(${currentScale})`}
    >
      {children}
    </g>
  );
};
