import type { GraphDocumentForFrontend } from "@/app/const/types";
import { getEdgeCompositeKeyFromLink } from "@/app/const/story-segment";

/**
 * セグメントフォーカス（nodeIds / edgeIds 複合キー）でグラフをフィルタする。
 * 表示するノード・リレーションのみを抽出したサブグラフを返す。
 *
 * @param graphDocument - フィルタリング対象のグラフ
 * @param nodeIds - 表示するノード ID の配列
 * @param edgeIds - 表示するエッジの複合キー（sourceId|targetId|type）の配列
 * @returns フィルタリングされたグラフ、または graphDocument が null/undefined の場合は undefined
 */
export function filterGraphBySegmentFocus(
  graphDocument: GraphDocumentForFrontend | null | undefined,
  nodeIds: string[],
  edgeIds: string[],
): GraphDocumentForFrontend | undefined {
  if (!graphDocument) return undefined;

  const nodeIdSet = new Set(nodeIds);
  const edgeIdSet = new Set(edgeIds);

  const filteredRelationships = graphDocument.relationships.filter((rel) =>
    edgeIdSet.has(getEdgeCompositeKeyFromLink(rel)),
  );

  const endpointNodeIds = new Set<string>();
  for (const rel of filteredRelationships) {
    endpointNodeIds.add(rel.sourceId);
    endpointNodeIds.add(rel.targetId);
  }

  const allIncludedNodeIds = new Set<string>([...nodeIdSet, ...endpointNodeIds]);
  const filteredNodes = graphDocument.nodes.filter((node) =>
    allIncludedNodeIds.has(node.id),
  );

  return {
    nodes: filteredNodes,
    relationships: filteredRelationships,
  };
}

/**
 * edgeIds が空で nodeIds のみのとき、フォーカスノードとその 1 ホップ隣（接続エッジ・隣接ノード）を含むサブグラフを返す。
 * 中心ノードの周辺を薄く表示する用途で使う。
 */
export function filterGraphBySegmentFocusWithNeighbors(
  graphDocument: GraphDocumentForFrontend | null | undefined,
  nodeIds: string[],
  edgeIds: string[],
): GraphDocumentForFrontend | undefined {
  if (!graphDocument) return undefined;

  if (edgeIds.length > 0) {
    return filterGraphBySegmentFocus(graphDocument, nodeIds, edgeIds);
  }

  if (nodeIds.length === 0) {
    return undefined;
  }

  const focusIdSet = new Set(nodeIds);
  const candidateRels = graphDocument.relationships.filter(
    (rel) =>
      focusIdSet.has(rel.sourceId) || focusIdSet.has(rel.targetId),
  );
  const allNodeIds = new Set<string>(nodeIds);
  for (const rel of candidateRels) {
    allNodeIds.add(rel.sourceId);
    allNodeIds.add(rel.targetId);
  }
  const filteredNodes = graphDocument.nodes.filter((node) =>
    allNodeIds.has(node.id),
  );
  const filteredRelationships = candidateRels.filter(
    (rel) =>
      allNodeIds.has(rel.sourceId) && allNodeIds.has(rel.targetId),
  );

  return {
    nodes: filteredNodes,
    relationships: filteredRelationships,
  };
}
