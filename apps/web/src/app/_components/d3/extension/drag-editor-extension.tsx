import { drag, type Simulation } from "d3";
import type { D3DragEvent } from "d3";
import * as d3 from "d3";
import type { CustomLinkType, CustomNodeType } from "@/app/const/types";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { RelationshipTypeForFrontend } from "@/app/const/types";
import { createId } from "@/app/_utils/cuid/cuid";

export interface DragState {
  isDragging: boolean;
  sourceNode: CustomNodeType | null;
  targetNode: CustomNodeType | null;
}

export const dragEditorExtension = ({
  tempLineRef,
  tempCircleRef,
  simulation,
  graphDocument,
  dragState,
  setDragState,
  onGraphUpdate,
  graphIdentifier,
}: {
  tempLineRef: React.RefObject<SVGLineElement>;
  tempCircleRef: React.RefObject<SVGCircleElement>;
  simulation: Simulation<CustomNodeType, CustomLinkType>;
  graphDocument: GraphDocumentForFrontend;
  dragState: DragState;
  setDragState: React.Dispatch<React.SetStateAction<DragState>>;
  onGraphUpdate?: (additionalGraph: GraphDocumentForFrontend) => void;
  graphIdentifier: string;
}) => {
  let dragStateInExtension = dragState;
  const dragReset = () => {
    if (tempLineRef.current) {
      tempLineRef.current.style.display = "none";
    }
    if (tempCircleRef.current) {
      tempCircleRef.current.style.display = "none";
    }

    simulation.restart();
    dragStateInExtension = {
      isDragging: false,
      sourceNode: null,
      targetNode: null,
    };
    setDragState(dragStateInExtension);
  };
  const dragSet = (newDragState: DragState) => {
    dragStateInExtension = newDragState;
    setDragState(dragStateInExtension);
  };

  const distance = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
  };

  // 新しいノードを追加する関数
  const addNewNode = (
    targetX: number,
    targetY: number,
    sourceNode: CustomNodeType,
  ) => {
    if (!onGraphUpdate) return;

    // const newNodeId = Math.max(...graphDocument.nodes.map((n) => n.id)) + 1;
    //  const newRelationshipId =
    //   Math.max(...graphDocument.relationships.map((r) => r.id)) + 1;
    const newNodeId = createId();
    const newRelationshipId = createId();

    const newNode: CustomNodeType = {
      id: newNodeId,
      name: `新しいノード${newNodeId}`,
      label: "Entity",
      properties: {},
      x: targetX,
      y: targetY,
    };

    const newRelationship: RelationshipTypeForFrontend = {
      id: newRelationshipId,
      sourceId: sourceNode.id,
      type: "CONNECTS",
      targetId: newNode.id,
      properties: {},
    };

    const additionalGraph: GraphDocumentForFrontend = {
      nodes: [newNode],
      relationships: [newRelationship],
    };

    onGraphUpdate(additionalGraph);
  };

  // 既存のノードに接続する関数
  const connectToExistingNode = (
    sourceNode: CustomNodeType,
    targetNode: CustomNodeType,
  ) => {
    if (!onGraphUpdate) return;

    // const newRelationshipId =
    //   Math.max(...graphDocument.relationships.map((r) => r.id)) + 1;
    const newRelationshipId = createId();

    const newRelationship: RelationshipTypeForFrontend = {
      id: newRelationshipId,
      sourceId: sourceNode.id,
      type: "CONNECTS",
      targetId: targetNode.id,
      properties: {},
    };

    const additionalGraph: GraphDocumentForFrontend = {
      nodes: [],
      relationships: [newRelationship],
    };

    onGraphUpdate(additionalGraph);
  };

  function dragStarted(
    event: D3DragEvent<SVGCircleElement, CustomNodeType, CustomNodeType>,
  ) {
    simulation.stop();

    // ドラッグ開始時のノードを特定
    const sourceNode = graphDocument.nodes.find((node) => {
      if (node.id === dragStateInExtension.sourceNode?.id) return false;

      // 位置情報がない場合はスキップ
      if (!("x" in node) || !("y" in node)) return false;

      const nodeX = (node as CustomNodeType).x ?? 0;
      const nodeY = (node as CustomNodeType).y ?? 0;
      return distance(event.x, event.y, nodeX, nodeY) < 5;
    });

    if (!sourceNode) {
      return;
    }

    dragSet({
      isDragging: true,
      sourceNode: sourceNode,
      targetNode: null,
    });

    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;

    // 一時的な線を表示
    if (tempLineRef.current) {
      tempLineRef.current.style.display = "block";
      tempLineRef.current.setAttribute("x1", String(event.subject.x));
      tempLineRef.current.setAttribute("y1", String(event.subject.y));
      tempLineRef.current.setAttribute("x2", String(event.subject.x));
      tempLineRef.current.setAttribute("y2", String(event.subject.y));
    }
    if (tempCircleRef.current) {
      tempCircleRef.current.style.display = "block";
      tempCircleRef.current.setAttribute("cx", String(event.subject.x));
      tempCircleRef.current.setAttribute("cy", String(event.subject.y));
    }
  }

  function dragged(
    event: D3DragEvent<SVGCircleElement, CustomNodeType, CustomNodeType>,
  ) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;

    simulation.stop();

    // targetNodeを更新
    const targetNode = graphDocument.nodes.find((node) => {
      if (node.id === dragStateInExtension.sourceNode?.id) return false;

      // 位置情報がない場合はスキップ
      if (!("x" in node) || !("y" in node)) return false;

      const nodeX = (node as CustomNodeType).x ?? 0;
      const nodeY = (node as CustomNodeType).y ?? 0;
      return distance(event.x, event.y, nodeX, nodeY) < 10;
    });
    if (targetNode) {
      dragSet({
        isDragging: true,
        sourceNode: dragStateInExtension.sourceNode,
        targetNode: targetNode,
      });
      if (tempCircleRef.current) {
        tempCircleRef.current.style.display = "none";
      }
    } else {
      dragSet({
        isDragging: true,
        sourceNode: dragStateInExtension.sourceNode,
        targetNode: null,
      });
      if (tempCircleRef.current) {
        tempCircleRef.current.style.display = "block";
        tempCircleRef.current.setAttribute("cx", String(event.x));
        tempCircleRef.current.setAttribute("cy", String(event.y));
      }
    }

    // 一時的な線を更新
    if (tempLineRef.current) {
      tempLineRef.current.setAttribute("x2", String(event.x));
      tempLineRef.current.setAttribute("y2", String(event.y));
    }
  }

  function dragEnded(
    event: D3DragEvent<SVGCircleElement, CustomNodeType, CustomNodeType>,
  ) {
    if (!dragStateInExtension.isDragging || !dragStateInExtension.sourceNode) {
      // ドラッグ状態をリセット
      dragReset();
      return;
    }

    if (dragStateInExtension.targetNode) {
      // 既存のノードに接続
      connectToExistingNode(
        dragStateInExtension.sourceNode,
        dragStateInExtension.targetNode,
      );
    } else if (
      dragStateInExtension.sourceNode.x &&
      dragStateInExtension.sourceNode.y &&
      distance(
        dragStateInExtension.sourceNode.x,
        dragStateInExtension.sourceNode.y,
        event.x,
        event.y,
      ) > 10
    ) {
      // 新しいノードを作成
      addNewNode(event.x, event.y, dragStateInExtension.sourceNode);
    }

    // ドラッグ状態をリセット
    dragReset();

    event.subject.fx = null;
    event.subject.fy = null;
  }

  d3.selectAll<Element, unknown>(`.${graphIdentifier}-node`).call(
    drag().on("start", dragStarted).on("drag", dragged).on("end", dragEnded),
  );
};
