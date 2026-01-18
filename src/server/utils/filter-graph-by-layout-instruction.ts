import type {
  GraphDocumentForFrontend,
  NodeTypeForFrontend,
  FilterCondition,
  LayoutInstruction,
} from "@/app/const/types";
import { bfsDistances } from "@/app/_utils/kg/bfs";

/**
 * ノードの値を取得
 */
function getNodeValue(
  node: NodeTypeForFrontend,
  field: string, // "label", "name", またはpropertiesのキー名
): string | undefined {
  if (field === "label") {
    return node.label;
  } else if (field === "name") {
    return node.name;
  } else {
    // properties[field]の値
    return node.properties[field];
  }
}

/**
 * 日付を比較する
 */
function compareDates(
  dateStr1: string,
  dateStr2: string,
  operator: "equals" | "after" | "before",
): boolean {
  const date1 = new Date(dateStr1).getTime();
  const date2 = new Date(dateStr2).getTime();

  if (isNaN(date1) || isNaN(date2)) return false;

  switch (operator) {
    case "equals":
      // 日付のみを比較（時刻を無視）
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
      );
    case "after":
      return date1 >= date2;
    case "before":
      return date1 <= date2;
  }
}

/**
 * フィルタ条件を再帰的に評価
 */
function evaluateFilterCondition(
  node: NodeTypeForFrontend,
  condition: FilterCondition,
): boolean {
  // グループの場合は再帰的に評価
  if (condition.type === "group") {
    const conditionResults = condition.conditions.map((c) =>
      evaluateFilterCondition(node, c),
    );

    // AND: すべての条件がtrue
    // OR: いずれかの条件がtrue
    return condition.logic === "AND"
      ? conditionResults.every((result) => result === true)
      : conditionResults.some((result) => result === true);
  }

  // リーフ条件（condition）の評価
  // ノードの値を取得
  const nodeValue = getNodeValue(node, condition.field);

  if (nodeValue === undefined || nodeValue === null) {
    return false;
  }

  const nodeValueStr = String(nodeValue);

  // 演算子に応じて評価
  switch (condition.operator) {
    case "equals":
      return nodeValueStr === String(condition.value);

    case "in":
      if (Array.isArray(condition.value)) {
        return condition.value.includes(nodeValueStr);
      }
      return false;

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
        if (isNaN(dateValue) || isNaN(fromDate) || isNaN(toDate)) {
          return false;
        }
        return dateValue >= fromDate && dateValue <= toDate;
      }
      return false;

    default:
      return false;
  }
}

/**
 * グラフから隣接リストを構築
 */
function buildAdjacencyList(
  graph: GraphDocumentForFrontend,
): Map<string, string[]> {
  const adj = new Map<string, string[]>();

  // すべてのノードを初期化
  graph.nodes.forEach((node) => {
    adj.set(node.id, []);
  });

  // リレーションシップから隣接関係を構築
  graph.relationships.forEach((rel) => {
    const sourceNeighbors = adj.get(rel.sourceId) ?? [];
    const targetNeighbors = adj.get(rel.targetId) ?? [];

    if (!sourceNeighbors.includes(rel.targetId)) {
      sourceNeighbors.push(rel.targetId);
    }
    if (!targetNeighbors.includes(rel.sourceId)) {
      targetNeighbors.push(rel.sourceId);
    }

    adj.set(rel.sourceId, sourceNeighbors);
    adj.set(rel.targetId, targetNeighbors);
  });

  return adj;
}

/**
 * LayoutInstructionのfilterに基づいてグラフをフィルタリング
 */
export function filterGraphByLayoutInstruction(
  graph: GraphDocumentForFrontend,
  filter: NonNullable<LayoutInstruction["filter"]>,
): GraphDocumentForFrontend {
  if (!filter) return graph;

  let candidateNodes: NodeTypeForFrontend[] = [];

  // 1. 中心ノードベースの絞り込み（BFS）
  if (filter.centerNodeIds && filter.centerNodeIds.length > 0) {
    const maxHops = filter.maxHops ?? 2;
    const adj = buildAdjacencyList(graph);
    const allReachableNodeIds = new Set<string>();

    // 各中心ノードからBFSを実行
    filter.centerNodeIds.forEach((centerNodeId) => {
      const distances = bfsDistances(centerNodeId, adj);
      distances.forEach((distance, nodeId) => {
        if (distance <= maxHops) {
          allReachableNodeIds.add(nodeId);
        }
      });
    });

    // 到達可能なノードのみを候補に
    candidateNodes = graph.nodes.filter((node) =>
      allReachableNodeIds.has(node.id),
    );
  } else {
    // 中心ノードが指定されていない場合は全ノードを候補に
    candidateNodes = graph.nodes;
  }

  // 2. フィルタ条件の適用（再帰的に評価）
  if (filter.condition) {
    candidateNodes = candidateNodes.filter((node) => {
      return evaluateFilterCondition(node, filter.condition!);
    });
  }

  // 3. 隣接ノードを含めるかどうか
  let finalNodes = candidateNodes;
  if (filter.includeNeighbors === true) {
    // フィルタリングされたノードに接続されている隣接ノードを追加
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

  // 4. エッジのフィルタリング（両端のノードが存在するもののみ）
  const finalNodeIds = new Set(finalNodes.map((n) => n.id));
  const filteredRelationships = graph.relationships.filter(
    (rel) => finalNodeIds.has(rel.sourceId) && finalNodeIds.has(rel.targetId),
  );

  return {
    nodes: finalNodes,
    relationships: filteredRelationships,
  };
}
