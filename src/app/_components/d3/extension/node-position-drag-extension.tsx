import { drag, type D3DragEvent } from "d3";
import * as d3 from "d3";
import type { RefObject } from "react";
import type { CustomNodeType } from "@/app/const/types";

function getSourceEventTarget(
  event: D3DragEvent<Element, unknown, unknown>,
): Element | null {
  const sourceEvent: unknown = event.sourceEvent;
  if (!(sourceEvent instanceof Event)) return null;
  const { target } = sourceEvent;
  return target instanceof Element ? target : null;
}

function stopSourceEventPropagation(
  event: D3DragEvent<Element, unknown, unknown>,
): void {
  const sourceEvent: unknown = event.sourceEvent;
  if (sourceEvent instanceof Event) {
    sourceEvent.stopPropagation();
  }
}

/** 固定レイアウト時にノードをドラッグで再配置する */
export function attachNodePositionDrag({
  graphIdentifier,
  nodeMapRef,
  onPositionChange,
  enabled,
  svgRef,
}: {
  graphIdentifier: string;
  nodeMapRef: RefObject<Map<string, CustomNodeType>>;
  onPositionChange: () => void;
  enabled: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
}): () => void {
  if (!enabled || !svgRef.current) return () => undefined;

  let dragNodeId: string | null = null;
  let rafId: number | null = null;

  const schedulePositionChange = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      onPositionChange();
    });
  };

  const resolveNodeId = (event: D3DragEvent<Element, unknown, unknown>) => {
    const target = getSourceEventTarget(event);
    const nodeEl = target?.closest(`.${graphIdentifier}-node`);
    return nodeEl
      ?.querySelector("[data-node-id]")
      ?.getAttribute("data-node-id");
  };

  const dragStarted = (event: D3DragEvent<Element, unknown, unknown>) => {
    const nodeId = resolveNodeId(event);
    if (!nodeId) return;

    const node = nodeMapRef.current?.get(nodeId);
    if (!node) return;

    dragNodeId = nodeId;
    stopSourceEventPropagation(event);
  };

  const dragged = (event: D3DragEvent<Element, unknown, unknown>) => {
    if (!dragNodeId) return;
    const node = nodeMapRef.current?.get(dragNodeId);
    if (!node) return;

    node.x = event.x;
    node.y = event.y;
    node.fx = event.x;
    node.fy = event.y;
    schedulePositionChange();
  };

  const dragEnded = (event: D3DragEvent<Element, unknown, unknown>) => {
    if (!dragNodeId) return;
    const node = nodeMapRef.current?.get(dragNodeId);
    if (node) {
      node.fx = event.x;
      node.fy = event.y;
      node.x = event.x;
      node.y = event.y;
    }
    dragNodeId = null;
    schedulePositionChange();
  };

  const selection = d3
    .select(svgRef.current)
    .selectAll<Element, unknown>(`.${graphIdentifier}-node`);
  selection.call(
    drag<Element, unknown>()
      .clickDistance(4)
      .on("start", dragStarted)
      .on("drag", dragged)
      .on("end", dragEnded),
  );

  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    selection.on(".drag", null);
  };
}
