import type React from "react";

export function StoryGraphSvgFrame({
  svgRef,
  width,
  height,
  freeExploreMode,
  showBottomFadeGradient,
  edgeFadePx,
  children,
}: {
  svgRef: React.RefObject<SVGSVGElement | null>;
  width: number;
  height: number;
  freeExploreMode: boolean;
  showBottomFadeGradient: boolean;
  edgeFadePx?: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      ref={svgRef as React.RefObject<SVGSVGElement>}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-hidden"
      style={{ maxWidth: "100%", height: "auto" }}
    >
      {(showBottomFadeGradient || edgeFadePx != null) && (
        <defs>
          {edgeFadePx != null ? (
            <>
              <linearGradient id="storytelling-edge-fade-top" x1={0} y1={0} x2={0} y2={edgeFadePx} gradientUnits="userSpaceOnUse">
                <stop offset={0} stopColor="black" />
                <stop offset={1} stopColor="white" />
              </linearGradient>
              <linearGradient id="storytelling-edge-fade-bottom" x1={0} y1={height} x2={0} y2={height - edgeFadePx} gradientUnits="userSpaceOnUse">
                <stop offset={0} stopColor="black" />
                <stop offset={1} stopColor="white" />
              </linearGradient>
              <linearGradient id="storytelling-edge-fade-left" x1={0} y1={0} x2={edgeFadePx} y2={0} gradientUnits="userSpaceOnUse">
                <stop offset={0} stopColor="black" />
                <stop offset={1} stopColor="white" />
              </linearGradient>
              <linearGradient id="storytelling-edge-fade-right" x1={width} y1={0} x2={width - edgeFadePx} y2={0} gradientUnits="userSpaceOnUse">
                <stop offset={0} stopColor="black" />
                <stop offset={1} stopColor="white" />
              </linearGradient>
              <mask id="storytelling-edge-fade-mask">
                <rect x={0} y={0} width={width} height={height} fill="white" />
                <rect x={0} y={0} width={width} height={edgeFadePx} fill="url(#storytelling-edge-fade-top)" />
                <rect x={0} y={height - edgeFadePx} width={width} height={edgeFadePx} fill="url(#storytelling-edge-fade-bottom)" />
                <rect x={0} y={0} width={edgeFadePx} height={height} fill="url(#storytelling-edge-fade-left)" />
                <rect x={width - edgeFadePx} y={0} width={edgeFadePx} height={height} fill="url(#storytelling-edge-fade-right)" />
              </mask>
            </>
          ) : (
            <>
              <linearGradient id="storytelling-bottom-fade-mask-gradient" x1={0} y1={height - 96} x2={0} y2={height} gradientUnits="userSpaceOnUse">
                <stop offset={0} stopColor="white" />
                <stop offset={1} stopColor="black" />
              </linearGradient>
              <mask id="storytelling-bottom-fade-mask">
                <rect x={0} y={0} width={width} height={height} fill="white" />
                <rect x={0} y={height - 96} width={width} height={96} fill="url(#storytelling-bottom-fade-mask-gradient)" />
              </mask>
            </>
          )}
        </defs>
      )}

      {!freeExploreMode && edgeFadePx != null ? (
        <g mask="url(#storytelling-edge-fade-mask)">{children}</g>
      ) : !freeExploreMode && showBottomFadeGradient ? (
        <g mask="url(#storytelling-bottom-fade-mask)">{children}</g>
      ) : (
        children
      )}
    </svg>
  );
}
