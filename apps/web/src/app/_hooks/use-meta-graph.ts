import { useMemo } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";

export interface MetaNodeData {
  communityId: string;
  memberNodeIds: string[];
  memberNodeNames: string[];
  size: number;
  title?: string;
  summary?: string;
  // コミュニティ内のエッジ情報
  internalEdges: Array<{
    sourceName: string;
    targetName: string;
    type: string;
  }>;
  // 他のコミュニティへの接続情報
  externalConnections: Array<{
    targetCommunityId: string;
    edgeCount: number;
    edgeTypes: string[];
  }>;
  // 他のコミュニティと接続があるかどうか
  hasExternalConnections: boolean;
}

export interface MetaGraphData {
  metaNodes: MetaNodeData[];
  metaGraph: GraphDocumentForFrontend;
  communityMap: Map<string, string>; // nodeId -> communityId
}

/**
 * グラフに対してLouvainアルゴリズムでコミュニティ検出を行い、
 * メタグラフ（コミュニティをノードとしたグラフ）を生成する
 */
export function useMetaGraph(
  graphDocument: GraphDocumentForFrontend | null | undefined,
): MetaGraphData | null {
  return useMemo(() => {
    if (!graphDocument?.nodes?.length) {
      return null;
    }

    try {
      // Graphologyグラフを作成
      const graph = new Graph();

      // ノードを追加
      graphDocument.nodes.forEach((node) => {
        graph.addNode(node.id, {
          name: node.name,
          label: node.label,
          properties: node.properties,
        });
      });

      // エッジを追加（無向グラフとして）
      graphDocument.relationships.forEach((rel) => {
        if (!graph.hasEdge(rel.sourceId, rel.targetId)) {
          graph.addEdge(rel.sourceId, rel.targetId, {
            type: rel.type,
            properties: rel.properties,
            weight: 1, // デフォルトの重み
          });
        }
      });

      // Louvainアルゴリズムでコミュニティ検出
      const communities = louvain(graph);

      // コミュニティIDごとにノードをグループ化
      const communityGroups = new Map<string, string[]>();
      const communityMap = new Map<string, string>();

      graphDocument.nodes.forEach((node) => {
        const communityId = communities[node.id] ?? "unassigned";
        if (!communityGroups.has(communityId.toString())) {
          communityGroups.set(communityId.toString(), []);
        }
        communityGroups.get(communityId.toString())!.push(node.id);
        communityMap.set(node.id, communityId.toString());
      });

      // コミュニティごとの内部エッジと外部接続を計算
      const communityInternalEdges = new Map<
        string,
        Array<{ sourceName: string; targetName: string; type: string }>
      >();
      const communityExternalConnections = new Map<
        string,
        Map<string, { count: number; types: Set<string> }>
      >();

      // 各コミュニティのエッジを分類
      graphDocument.relationships.forEach((rel) => {
        const sourceCommunity = communities[rel.sourceId] ?? "unassigned";
        const targetCommunity = communities[rel.targetId] ?? "unassigned";
        const sourceNode = graphDocument.nodes.find(
          (n) => n.id === rel.sourceId,
        );
        const targetNode = graphDocument.nodes.find(
          (n) => n.id === rel.targetId,
        );

        if (!sourceNode || !targetNode) return;

        if (sourceCommunity === targetCommunity) {
          // 内部エッジ
          if (!communityInternalEdges.has(sourceCommunity.toString())) {
            communityInternalEdges.set(sourceCommunity.toString(), []);
          }
          communityInternalEdges.get(sourceCommunity.toString())!.push({
            sourceName: sourceNode.name,
            targetName: targetNode.name,
            type: rel.type,
          });
        } else {
          // 外部エッジ（双方向を考慮）
          const commId = sourceCommunity.toString();
          const targetCommId = targetCommunity.toString();

          if (!communityExternalConnections.has(commId)) {
            communityExternalConnections.set(commId, new Map());
          }
          const connections = communityExternalConnections.get(commId)!;

          if (!connections.has(targetCommId)) {
            connections.set(targetCommId, { count: 0, types: new Set() });
          }
          const conn = connections.get(targetCommId)!;
          conn.count += 1;
          conn.types.add(rel.type);
        }
      });

      // メタノードを作成
      const metaNodes: MetaNodeData[] = Array.from(
        communityGroups.entries(),
      ).map(([communityId, memberNodeIds]) => {
        const memberNodes = memberNodeIds
          .map((id) => graphDocument.nodes.find((n) => n.id === id))
          .filter((n) => n !== undefined);

        const internalEdges =
          communityInternalEdges.get(communityId)?.slice(0, 20) ?? []; // 最大20個の内部エッジ
        const externalConnMap = communityExternalConnections.get(communityId);
        const externalConnections = externalConnMap
          ? Array.from(externalConnMap.entries()).map(
              ([targetCommId, data]) => ({
                targetCommunityId: targetCommId,
                edgeCount: data.count,
                edgeTypes: Array.from(data.types),
              }),
            )
          : [];

        return {
          communityId,
          memberNodeIds,
          memberNodeNames: memberNodes.map((n) => n.name),
          size: memberNodeIds.length,
          internalEdges,
          externalConnections,
          hasExternalConnections: externalConnections.length > 0,
        };
      });

      // メタエッジを作成（コミュニティ間のエッジを集約）
      const metaEdgesMap = new Map<
        string,
        { count: number; types: Set<string> }
      >();

      graphDocument.relationships.forEach((rel) => {
        const sourceCommunity = communities[rel.sourceId] ?? "unassigned";
        const targetCommunity = communities[rel.targetId] ?? "unassigned";

        if (sourceCommunity !== targetCommunity) {
          const edgeKey = `${sourceCommunity}-${targetCommunity}`;
          const reverseKey = `${targetCommunity}-${sourceCommunity}`;

          // 双方向のエッジを1つにまとめる
          const key = edgeKey < reverseKey ? edgeKey : reverseKey;
          const existing = metaEdgesMap.get(key);

          if (existing) {
            existing.count += 1;
            existing.types.add(rel.type);
          } else {
            metaEdgesMap.set(key, {
              count: 1,
              types: new Set([rel.type]),
            });
          }
        }
      });

      // メタグラフのノード（コミュニティ）を作成
      const metaGraphNodes = metaNodes.map((metaNode) => ({
        id: metaNode.communityId,
        name: metaNode.title ?? `Community ${metaNode.communityId}`,
        label: "Community",
        properties: {
          size: String(metaNode.size),
          memberCount: String(metaNode.size),
          memberNames: metaNode.memberNodeNames.slice(0, 10).join(", "), // 最初の10個のノード名
        },
        topicSpaceId: undefined,
        documentGraphId: undefined,
        neighborLinkCount: metaEdgesMap.size, // 簡易的な次数
        visible: true,
      }));

      // メタグラフのエッジを作成
      const metaGraphRelationships = Array.from(metaEdgesMap.entries()).map(
        ([edgeKey, edgeData], index) => {
          const [sourceCommunity, targetCommunity] = edgeKey.split("-");

          if (!sourceCommunity || !targetCommunity) {
            console.error("Invalid edge key:", edgeKey);
          }

          return {
            id: `meta-edge-${index}`,
            type: Array.from(edgeData.types).join(", "),
            properties: {
              weight: String(edgeData.count),
              edgeCount: String(edgeData.count),
            },
            sourceId: sourceCommunity ?? "",
            targetId: targetCommunity ?? "",
            topicSpaceId: undefined,
            documentGraphId: undefined,
          };
        },
      );

      const metaGraph: GraphDocumentForFrontend = {
        nodes: metaGraphNodes,
        relationships: metaGraphRelationships,
      };

      return {
        metaNodes,
        metaGraph,
        communityMap,
      };
    } catch (error) {
      console.error("Failed to generate meta graph:", error);
      return null;
    }
  }, [graphDocument]);
}
