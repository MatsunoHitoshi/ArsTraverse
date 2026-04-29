import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import type { MetaGraphGraphDoc, TopologyClusterResult } from "./types";

/** 無向・等重みで Louvain コミュニティ検出（現行と同じ） */
export function clusterLouvainUnweighted(
  graphDocument: MetaGraphGraphDoc,
): TopologyClusterResult {
  const fullGraph = new Graph();
  graphDocument.nodes.forEach((node) => {
    fullGraph.addNode(node.id, {
      name: node.name,
      label: node.label,
      properties: node.properties ?? {},
    });
  });
  graphDocument.relationships.forEach((rel) => {
    if (!fullGraph.hasEdge(rel.sourceId, rel.targetId)) {
      fullGraph.addEdge(rel.sourceId, rel.targetId, {
        type: rel.type,
        properties: rel.properties ?? {},
        weight: 1,
      });
    }
  });
  const labels = louvain(fullGraph) as Record<string, number>;

  const labelToNodeIds = new Map<number, string[]>();
  graphDocument.nodes.forEach((node) => {
    const num = labels[node.id];
    if (num === undefined) return;
    if (!labelToNodeIds.has(num)) labelToNodeIds.set(num, []);
    labelToNodeIds.get(num)!.push(node.id);
  });

  return { nodeClusterLabel: labels, labelToNodeIds };
}
