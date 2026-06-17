"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3";
import type { ForceLink, Simulation } from "d3";
import type {
  CustomLinkType,
  CustomNodeType,
  GraphDocumentForFrontend,
} from "@/app/const/types";
import type { SkeletonMotionData, SkeletonViewCamera } from "@/app/const/skeleton-motion";
import { DEFAULT_SKELETON_VIEW_PITCH } from "@/app/const/skeleton-motion";
import { getNodeByIdForFrontend } from "@/app/_utils/kg/filter";
import { GraphLinkSkeletonMotion } from "@/app/_components/d3/force/graph-link-edge-semantic-pictogram";
import { calcEdgeLabelPos } from "@/app/_components/d3/force/storytelling-graph/utils/graph-utils";

const NODE_RADIUS = 10;
const LINK_DISTANCE = 100;
const DISPLAY_SCALE = 1;
const EDGE_FLOW_PERIOD_MS = 1400;

/** Vertical offset of edge type label from edge midpoint (matches SVG text y). */
export const EDGE_TYPE_LABEL_OFFSET_Y = 8;

/** Extra lift along edge normal (px) so skeleton sits outside the type label. */
export const DEFAULT_SKELETON_ABOVE_EDGE_LABEL_EXTRA_Y = 42;

export type GraphMotionPlacement = {
  positionT: number;
  opacity: number;
  scaleMultiplier: number;
  facesLeft?: boolean;
  /** When true, skeleton is anchored above edge type label. */
  anchorAtEdgeLabel?: boolean;
  /** Additional normal-direction offset when anchorAtEdgeLabel (px). */
  anchorLabelLiftY?: number;
  /** Align 3D walk direction with edge (requires frames3d). */
  alignWithEdge?: boolean;
  /** Camera pitch in degrees (oblique view). */
  viewPitchDeg?: number;
  /** Extra yaw offset in degrees. */
  viewYawOffsetDeg?: number;
  /** Advance along edge from source using foot activity in motion data. */
  footTravelFromFeet?: boolean;
};

export type GraphMotionCanvasProps = {
  graph: GraphDocumentForFrontend;
  width: number;
  height: number;
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string) => void;
  motionData: SkeletonMotionData | null;
  playbackProgress?: number;
  placement: GraphMotionPlacement;
};

function getNodeId(endpoint: CustomLinkType["source"]): string {
  return typeof endpoint === "object" ? endpoint.id : String(endpoint);
}

function resolveLinkEndpoints(
  link: CustomLinkType,
  nodes: CustomNodeType[],
): { src: CustomNodeType; tgt: CustomNodeType } | null {
  const srcId = getNodeId(link.source);
  const tgtId = getNodeId(link.target);
  const src = nodes.find((n) => n.id === srcId);
  const tgt = nodes.find((n) => n.id === tgtId);
  if (!src || !tgt || src.x == null || src.y == null || tgt.x == null || tgt.y == null) {
    return null;
  }
  return { src, tgt };
}

function pointerToSvgPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

export function GraphMotionCanvas({
  graph,
  width,
  height,
  selectedEdgeId,
  onSelectEdge,
  motionData,
  playbackProgress,
  placement,
}: GraphMotionCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  const initNodes = useMemo((): CustomNodeType[] => {
    return graph.nodes.map((n) => ({
      ...n,
      x: width / 2,
      y: height / 2,
    }));
  }, [graph.nodes, width, height]);

  const initLinks = useMemo((): CustomLinkType[] => {
    if (!graph.relationships.length || !initNodes.length) return [];
    return graph.relationships
      .map((rel) => {
        const source = getNodeByIdForFrontend(rel.sourceId, initNodes);
        const target = getNodeByIdForFrontend(rel.targetId, initNodes);
        if (!source || !target) return null;
        return { ...rel, source, target };
      })
      .filter((link): link is NonNullable<typeof link> => link != null) as CustomLinkType[];
  }, [graph.relationships, initNodes]);

  const [nodes, setNodes] = useState<CustomNodeType[]>(initNodes);
  const [links, setLinks] = useState<CustomLinkType[]>(initLinks);
  const simulationRef = useRef<Simulation<CustomNodeType, CustomLinkType> | null>(
    null,
  );

  useEffect(() => {
    if (width <= 0 || height <= 0 || !initNodes.length) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const simulation = forceSimulation<CustomNodeType, CustomLinkType>(initNodes)
      .force(
        "link",
        forceLink<CustomNodeType, CustomLinkType>(initLinks)
          .id((d) => d.id)
          .distance(LINK_DISTANCE)
          .strength(0.4),
      )
      .force("charge", forceManyBody().strength(-180))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(NODE_RADIUS + 6));

    simulation.stop();
    simulation.tick(250);

    setNodes([...simulation.nodes()]);
    const linkForce =
      simulation.force<ForceLink<CustomNodeType, CustomLinkType>>("link");
    if (linkForce?.links) {
      setLinks([...linkForce.links()]);
    }
    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [initNodes, initLinks, width, height]);

  const selectedLink = useMemo(
    () => links.find((l) => l.id === selectedEdgeId) ?? null,
    [links, selectedEdgeId],
  );

  const selectedLinkResolved = useMemo(() => {
    if (!selectedLink) return null;
    const endpoints = resolveLinkEndpoints(selectedLink, nodes);
    if (!endpoints) return null;
    return {
      ...selectedLink,
      source: endpoints.src,
      target: endpoints.tgt,
    };
  }, [selectedLink, nodes]);

  const [edgeFlowPhase, setEdgeFlowPhase] = useState(0);
  useEffect(() => {
    if (!selectedLinkResolved || !motionData) {
      setEdgeFlowPhase(0);
      return;
    }
    let rafId = 0;
    let startAt: number | null = null;
    const tick = (now: number) => {
      if (startAt == null) startAt = now;
      const elapsed = now - startAt;
      setEdgeFlowPhase((elapsed % EDGE_FLOW_PERIOD_MS) / EDGE_FLOW_PERIOD_MS);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [selectedLinkResolved, motionData]);

  const edgeFlowStops = useMemo(() => {
    const center = edgeFlowPhase;
    const halfWidth = 0.11;
    const fadeWidth = 0.03;
    const start = Math.max(0, center - halfWidth);
    const end = Math.min(1, center + halfWidth);
    return [
      { offset: 0, opacity: 0.8 },
      { offset: start, opacity: 0.8 },
      { offset: Math.min(1, start + fadeWidth), opacity: 0.18 },
      { offset: Math.max(0, end - fadeWidth), opacity: 0.18 },
      { offset: end, opacity: 0.8 },
      { offset: 1, opacity: 0.8 },
    ];
  }, [edgeFlowPhase]);

  const effectiveDisplayScale =
    DISPLAY_SCALE / Math.max(0.25, placement.scaleMultiplier);

  const viewCamera = useMemo((): SkeletonViewCamera | null => {
    if (!selectedLinkResolved) return null;
    const src = selectedLinkResolved.source;
    const tgt = selectedLinkResolved.target;
    if (
      src.x == null ||
      src.y == null ||
      tgt.x == null ||
      tgt.y == null
    ) {
      return null;
    }
    const maxPitchDeg = placement.viewPitchDeg ?? Math.round(
      (DEFAULT_SKELETON_VIEW_PITCH * 180) / Math.PI,
    );
    const edgeDx = tgt.x - src.x;
    const edgeDy = tgt.y - src.y;
    const edgeLen = Math.hypot(edgeDx, edgeDy);
    // Horizontal edge => 0deg, vertical edge => maxPitchDeg (linear).
    const verticalRatio = edgeLen > 1e-6 ? Math.abs(edgeDy) / edgeLen : 0;
    const pitchDeg = maxPitchDeg * verticalRatio;
    return {
      edgeDx,
      edgeDy,
      pitch: (pitchDeg * Math.PI) / 180,
      yawOffset: ((placement.viewYawOffsetDeg ?? 0) * Math.PI) / 180,
      alignWithEdge: placement.alignWithEdge !== false,
    };
  }, [selectedLinkResolved, placement]);

  const updateNodePosition = useCallback(
    (nodeId: string, x: number, y: number) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
      );
    },
    [],
  );

  const handleNodePointerDown = useCallback(
    (event: React.PointerEvent<SVGCircleElement>, nodeId: string) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraggingNodeId(nodeId);
    },
    [],
  );

  const handleNodePointerMove = useCallback(
    (event: React.PointerEvent<SVGCircleElement>) => {
      if (!draggingNodeId || !svgRef.current) return;
      const { x, y } = pointerToSvgPoint(
        svgRef.current,
        event.clientX,
        event.clientY,
      );
      updateNodePosition(draggingNodeId, x, y);
    },
    [draggingNodeId, updateNodePosition],
  );

  const handleNodePointerUp = useCallback(
    (event: React.PointerEvent<SVGCircleElement>) => {
      if (draggingNodeId && event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setDraggingNodeId(null);
    },
    [draggingNodeId],
  );

  const isDragging = draggingNodeId != null;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className={`rounded-xl border border-gray-700 bg-slate-950 touch-none ${isDragging ? "cursor-grabbing" : ""
        }`}
      role="img"
      aria-label="Knowledge graph motion preview"
    >
      <defs>
        <marker
          id="graph-motion-arrow"
          viewBox="0 -4 8 8"
          refX={6}
          refY={0}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0,-4 L8,0 L0,4" fill="#64748b" />
        </marker>
        {selectedLinkResolved && motionData && (
          <linearGradient
            id="graph-motion-edge-flow"
            gradientUnits="userSpaceOnUse"
            x1={selectedLinkResolved.source.x}
            y1={selectedLinkResolved.source.y}
            x2={selectedLinkResolved.target.x}
            y2={selectedLinkResolved.target.y}
          >
            {edgeFlowStops.map((stop, i) => (
              <stop
                // eslint-disable-next-line react/no-array-index-key
                key={`edge-flow-stop-${i}`}
                offset={`${Math.round(stop.offset * 100)}%`}
                stopColor="#7dd3fc"
                stopOpacity={stop.opacity}
              />
            ))}
          </linearGradient>
        )}
      </defs>

      <g>
        {links.map((link) => {
          const endpoints = resolveLinkEndpoints(link, nodes);
          if (!endpoints) return null;

          const { src, tgt } = endpoints;
          const isSelected = link.id === selectedEdgeId;
          const stroke = isSelected ? "#38bdf8" : "#475569";
          const strokeWidth = isSelected ? 2.5 : 1.5;
          const { x: labelX, y: labelY, angle: labelAngle } = calcEdgeLabelPos(
            src.x!,
            src.y!,
            tgt.x!,
            tgt.y!,
            true,
            isSelected,
          );

          return (
            <g key={`edge-${link.id}`}>
              <line
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke="transparent"
                strokeWidth={16}
                className="cursor-pointer"
                onClick={() => onSelectEdge(link.id)}
              />
              <line
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={
                  isSelected && motionData
                    ? "url(#graph-motion-edge-flow)"
                    : stroke
                }
                strokeWidth={strokeWidth}
                markerEnd="url(#graph-motion-arrow)"
                className="pointer-events-none"
              />
              <text
                transform={`translate(${labelX},${labelY}) rotate(${labelAngle})`}
                textAnchor="middle"
                fill={isSelected ? "#7dd3fc" : "#94a3b8"}
                fontSize={11}
                className="pointer-events-none select-none"
              >
                {link.type}
              </text>
            </g>
          );
        })}
      </g>

      <g>
        {nodes.map((node) => {
          if (node.x == null || node.y == null) return null;
          const isOnSelectedEdge =
            selectedLink &&
            (node.id === getNodeId(selectedLink.source) ||
              node.id === getNodeId(selectedLink.target));
          const isDraggingThis = draggingNodeId === node.id;

          return (
            <g key={`node-${node.id}`}>
              <circle
                cx={node.x}
                cy={node.y}
                r={NODE_RADIUS}
                fill={isOnSelectedEdge ? "#0ea5e9" : "#334155"}
                stroke={isOnSelectedEdge ? "#7dd3fc" : "#64748b"}
                strokeWidth={isOnSelectedEdge ?? isDraggingThis ? 2 : 1}
                className={
                  isDraggingThis
                    ? "cursor-grabbing"
                    : "cursor-grab hover:stroke-sky-400"
                }
                onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
                onPointerCancel={handleNodePointerUp}
              />
              <text
                x={node.x}
                y={node.y + NODE_RADIUS + 14}
                textAnchor="middle"
                fill="#e2e8f0"
                fontSize={12}
                className="pointer-events-none select-none"
              >
                {node.name}
              </text>
            </g>
          );
        })}
      </g>

      {selectedLinkResolved && motionData && (
        <GraphLinkSkeletonMotion
          graphLink={selectedLinkResolved}
          motionData={motionData}
          displayScale={effectiveDisplayScale}
          positionT={placement.positionT}
          anchorAtEdgeLabel={placement.anchorAtEdgeLabel}
          skeletonAboveLabelExtraY={
            placement.anchorLabelLiftY ?? DEFAULT_SKELETON_ABOVE_EDGE_LABEL_EXTRA_Y
          }
          footTravelFromFeet={placement.footTravelFromFeet !== false}
          hasExplicitEdges
          isFocusEdge
          playbackProgress={playbackProgress}
          loopCrossfade={false}
          opacity={placement.opacity}
          facesLeft={placement.facesLeft}
          viewCamera={viewCamera}
        />
      )}
    </svg>
  );
}
