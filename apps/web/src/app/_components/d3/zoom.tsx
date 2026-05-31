import type { ZoomBehavior } from "d3";
import React, { useEffect, useRef } from "react";
import { select, zoom, zoomIdentity, zoomTransform } from "d3";

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
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(
    null,
  );

  useEffect(() => {
    if (!svgRef.current) return;
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

    zoomBehaviorRef.current = zoomBehavior;
    svgScreen.call(zoomBehavior);
  }, [setCurrentScale, setCurrentTransformX, setCurrentTransformY]);

  // 親がプログラムで scale/transform を更新したとき（例: セグメントフォーカス時のズーム）に
  // D3 zoom の内部状態も同期する。手動操作が「現在のビュー」を基準になるようにする。
  useEffect(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svgScreen = select<SVGSVGElement, unknown>(svgRef.current);
    const current = zoomTransform(svgRef.current);
    const same =
      current &&
      Math.abs(current.k - currentScale) < 1e-6 &&
      Math.abs(current.x - currentTransformX) < 1e-6 &&
      Math.abs(current.y - currentTransformY) < 1e-6;
    if (same) return;
    const newTransform = zoomIdentity
      .translate(currentTransformX, currentTransformY)
      .scale(currentScale);
    const zoomBehavior = zoomBehaviorRef.current;
    svgScreen.call(zoomBehavior.transform.bind(zoomBehavior), newTransform);
  }, [currentScale, currentTransformX, currentTransformY, svgRef]);

  return (
    <g
      transform={`translate(${currentTransformX}, ${currentTransformY})scale(${currentScale})`}
    >
      {children}
    </g>
  );
};
