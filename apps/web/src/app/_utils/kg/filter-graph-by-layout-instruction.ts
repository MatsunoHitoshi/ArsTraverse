import type {
  GraphDocumentForFrontend,
  NodeTypeForFrontend,
  FilterCondition,
  LayoutInstruction,
} from "@/app/const/types";
import { bfsDistances } from "@/app/_utils/kg/bfs";

function getNodeValue(
  node: NodeTypeForFrontend,
  field: string,
): string | undefined {
  if (field === "label") return node.label;
  if (field === "name") return node.name;
  return node.properties[field];
}

function compareDates(
  dateStr1: string,
  dateStr2: string,
  operator: "equals" | "after" | "before",
): boolean {
  const date1 = new Date(dateStr1).getTime();
  const date2 = new Date(dateStr2).getTime();
  if (isNaN(date1) || isNaN(date2)) return false;
  switch (operator) {
    case "equals": {
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
      );
    }
    case "after":
      return date1 >= date2;
    case "before":
      return date1 <= date2;
  }
}

function evaluateFilterCondition(
  node: NodeTypeForFrontend,
  condition: FilterCondition,
): boolean {
  if (condition.type === "group") {
    const results = condition.conditions.map((c) =>
      evaluateFilterCondition(node, c),
    );
    return condition.logic === "AND"
      ? results.every(Boolean)
      : results.some(Boolean);
  }
  const nodeValue = getNodeValue(node, condition.field);
  if (nodeValue === undefined || nodeValue === null) return false;
  const nodeValueStr = String(nodeValue);
  switch (condition.operator) {
    case "equals":
      return nodeValueStr === String(condition.value);
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(nodeValueStr);
    case "contains":
      return nodeValueStr.includes(String(condition.value));
    case "date_equals":
      return compareDates(nodeValueStr, String(condition.value), "equals");
    case "date_after":
      return compareDates(nodeValueStr, String(condition.value), "after");
    case "date_before":
      return compareDates(nodeValueStr, String(condition.value), "before");
    case "date_range":
      if (
        typeof condition.value === "object" &&
        "from" in condition.value &&
        "to" in condition.value
      ) {
        const dateValue = new Date(nodeValueStr).getTime();
        const fromDate = new Date(condition.value.from).getTime();
        const toDate = new Date(condition.value.to).getTime();
        if (isNaN(dateValue) || isNaN(fromDate) || isNaN(toDate)) return false;
        return dateValue >= fromDate && dateValue <= toDate;
      }
      return false;
    default:
      return false;
  }
}

function buildAdjacencyList(
  graph: GraphDocumentForFrontend,
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  graph.nodes.forEach((node) => adj.set(node.id, []));
  graph.relationships.forEach((rel) => {
    const sourceNeighbors = adj.get(rel.sourceId) ?? [];
    const targetNeighbors = adj.get(rel.targetId) ?? [];
    if (!sourceNeighbors.includes(rel.targetId)) sourceNeighbors.push(rel.targetId);
    if (!targetNeighbors.includes(rel.sourceId)) targetNeighbors.push(rel.sourceId);
    adj.set(rel.sourceId, sourceNeighbors);
    adj.set(rel.targetId, targetNeighbors);
  });
  return adj;
}

export interface FilterGraphOptions {
  /** セグメントで参照されているノードID（includeSegmentNodes が true のときにフィルタ結果に追加） */
  segmentNodeIds?: string[];
}

/**
 * LayoutInstructionのfilterに基づいてグラフをフィルタリング（クライアント用）
 */
export function filterGraphByLayoutInstruction(
  graph: GraphDocumentForFrontend,
  filter: NonNullable<LayoutInstruction["filter"]>,
  options?: FilterGraphOptions,
): GraphDocumentForFrontend {
  if (!filter) return graph;
  let candidateNodes: NodeTypeForFrontend[] = [];
  if (filter.centerNodeIds && filter.centerNodeIds.length > 0) {
    const maxHops = filter.maxHops ?? 2;
    const adj = buildAdjacencyList(graph);
    const allReachableNodeIds = new Set<string>();
    filter.centerNodeIds.forEach((centerNodeId) => {
      const distances = bfsDistances(centerNodeId, adj);
      distances.forEach((distance, nodeId) => {
        if (distance <= maxHops) allReachableNodeIds.add(nodeId);
      });
    });
    candidateNodes = graph.nodes.filter((node) => allReachableNodeIds.has(node.id));
  } else {
    candidateNodes = graph.nodes;
  }
  if (filter.condition) {
    candidateNodes = candidateNodes.filter((node) =>
      evaluateFilterCondition(node, filter.condition!),
    );
  }
  let finalNodes = candidateNodes;
  if (filter.includeNeighbors === true) {
    const candidateNodeIds = new Set(candidateNodes.map((n) => n.id));
    const neighborNodes = graph.nodes.filter(
      (node) =>
        !candidateNodeIds.has(node.id) &&
        graph.relationships.some(
          (rel) =>
            (candidateNodeIds.has(rel.sourceId) && rel.targetId === node.id) ||
            (candidateNodeIds.has(rel.targetId) && rel.sourceId === node.id),
        ),
    );
    finalNodes = [...candidateNodes, ...neighborNodes];
  }
  // セグメント参照ノードを追加（includeSegmentNodes が true のとき）
  if (filter.includeSegmentNodes !== false && options?.segmentNodeIds?.length) {
    const currentNodeIds = new Set(finalNodes.map((n) => n.id));
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const segmentNodesToAdd: NodeTypeForFrontend[] = [];
    for (const nodeId of options.segmentNodeIds) {
      if (!currentNodeIds.has(nodeId)) {
        const node = nodeById.get(nodeId);
        if (node) {
          segmentNodesToAdd.push(node);
          currentNodeIds.add(nodeId);
        }
      }
    }
    if (segmentNodesToAdd.length > 0) {
      finalNodes = [...finalNodes, ...segmentNodesToAdd];
    }
  }
  const finalNodeIds = new Set(finalNodes.map((n) => n.id));
  const filteredRelationships = graph.relationships.filter(
    (rel) => finalNodeIds.has(rel.sourceId) && finalNodeIds.has(rel.targetId),
  );
  return { nodes: finalNodes, relationships: filteredRelationships };
}
