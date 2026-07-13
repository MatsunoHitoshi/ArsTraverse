import type { GraphDocumentForFrontend } from "@/app/const/types";
import {
  getNodeNameKeys,
  normalizeNameKey,
} from "@/app/_utils/kg/node-name-match";

/**
 * エンティティ名のリストに基づいてグラフをフィルタリングする
 * テキストに含まれるエンティティのノードと、それらを接続するリレーションシップ、
 * およびそのリレーションシップによって接続される隣接ノードを含むグラフを返す
 *
 * @param graphDocument - フィルタリング対象のグラフ
 * @param entityNames - フィルタリングに使用するエンティティ名の配列
 * @returns フィルタリングされたグラフ、またはgraphDocumentがnull/undefinedの場合はundefined
 */
export const filterGraphByEntityNames = (
  graphDocument: GraphDocumentForFrontend | null | undefined,
  entityNames: string[],
): GraphDocumentForFrontend | undefined => {
  if (!graphDocument) return undefined;

  // エンティティ名に一致するノードをフィルタリング
  // node.name だけでなく name_ja / name_en も考慮し、表記言語の違いを吸収する
  const entityNameKeys = new Set(entityNames.map(normalizeNameKey));
  const filteredNodes = graphDocument.nodes.filter((node) => {
    for (const key of getNodeNameKeys(node)) {
      if (entityNameKeys.has(key)) return true;
    }
    return false;
  });

  const filteredNodeIds = filteredNodes.map((node) => node.id);

  // まず、filteredNodesのいずれかのノードを含むリレーションシップを取得
  const candidateRelationships = graphDocument.relationships.filter(
    (relationship) =>
      filteredNodeIds.includes(relationship.sourceId) ||
      filteredNodeIds.includes(relationship.targetId),
  );

  // リレーションシップに接続されている隣接ノードを取得
  const neighborNodes = graphDocument.nodes.filter((node) =>
    candidateRelationships.some(
      (relationship) =>
        relationship.sourceId === node.id || relationship.targetId === node.id,
    ),
  );

  // すべてのノード（filteredNodes + neighborNodes）のIDを取得
  const allNodeIds = [...filteredNodes, ...neighborNodes].map(
    (node) => node.id,
  );

  // 両端のノードが存在するリレーションシップのみをフィルタリング
  const filteredRelationships = candidateRelationships.filter(
    (relationship) =>
      allNodeIds.includes(relationship.sourceId) &&
      allNodeIds.includes(relationship.targetId),
  );

  // 最終的なノードリスト（重複を除去）
  const allNodes = [...filteredNodes, ...neighborNodes];
  const uniqueNodes = allNodes.filter(
    (node, index, self) => index === self.findIndex((n) => n.id === node.id),
  );

  return {
    nodes: uniqueNodes,
    relationships: filteredRelationships,
  };
};
