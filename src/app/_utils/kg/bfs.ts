import { getNeighborNodes } from "./get-tree-layout-data";
import type {
  GraphDocumentForFrontend,
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";

export const nodePathSearch = (
  graph: GraphDocumentForFrontend,
  startId: string,
  endId: string,
  cutOff?: number,
) => {
  const isReached = (path: {
    nodes: NodeTypeForFrontend[];
    relationships: RelationshipTypeForFrontend[];
  }) => {
    const firstNode = path.nodes[0];
    const lastNode = path.nodes[path.nodes.length - 1];
    return firstNode?.id === startId && lastNode?.id === endId;
  };

  const nonDirectionalResult = nonDirectionalBfs(graph, startId, endId, cutOff);

  return isReached(nonDirectionalResult)
    ? nonDirectionalResult
    : { nodes: [], relationships: [] };
};

const nonDirectionalBfs = (
  graph: GraphDocumentForFrontend,
  startId: string,
  endId: string,
  cutOff?: number,
) => {
  const visited = new Set<string>();
  const queue: string[][] = [[startId]];
  const nodes: NodeTypeForFrontend[] = [];
  const endNode = graph.nodes.find((n) => n.id === endId);

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) continue;

    const node = path[path.length - 1]!;
    if (!visited.has(node)) {
      visited.add(node);
      const currentNode = graph.nodes.find((n) => n.id === node);
      if (currentNode) {
        nodes.push(currentNode);
        if (node === endId) {
          return getOptimalPath(graph, nodes);
        }
        const neighbors = graph.relationships
          .filter((r) => r.sourceId === node || r.targetId === node)
          .map((r) => (r.sourceId === node ? r.targetId : r.sourceId))
          .filter((id): id is string => id !== undefined);
        if (cutOff && path.length > cutOff) {
          return { nodes: [], relationships: [] };
        }

        if (neighbors.includes(endId) && endNode) {
          const nodesEnd = nodes.concat([endNode]);

          return getOptimalPath(graph, nodesEnd);
        }
        for (const neighbor of neighbors) {
          queue.push([...path, neighbor]);
        }
      }
    }
  }
  return getOptimalPath(graph, nodes);
};

const getOptimalPath = (
  graph: GraphDocumentForFrontend,
  nodes: NodeTypeForFrontend[],
) => {
  const optimalPath = {
    nodes: [] as NodeTypeForFrontend[],
    relationships: [] as RelationshipTypeForFrontend[],
  };
  const shortestPath = [nodes[nodes.length - 1]] as NodeTypeForFrontend[];
  const reverseNodes = nodes.reverse();
  reverseNodes.forEach((node, index) => {
    if (node.id !== shortestPath[0]?.id) {
      console.log("skip");
    } else {
      const reachedNodes = reverseNodes.slice(index + 1);
      const neighbors = getNeighborNodes(graph, node.id, "BOTH");
      const pathNode = neighbors.find((neighbor) => {
        return reachedNodes.some((reached) => {
          return reached.id === neighbor.id;
        });
      });
      if (pathNode) {
        shortestPath.unshift(pathNode);
      } else {
        console.log("PrevPath Not Found");
      }
    }
  });
  optimalPath.nodes = shortestPath;
  optimalPath.relationships = getPathRelationships(graph, shortestPath);
  return optimalPath;
};

const getPathRelationships = (
  graph: GraphDocumentForFrontend,
  pathNodes: NodeTypeForFrontend[],
) => {
  const pathRelationships = [] as RelationshipTypeForFrontend[];
  pathNodes.forEach((node, index) => {
    if (index !== 0) {
      const prevNode = pathNodes[index - 1];
      const edges = graph.relationships.filter((relationship) => {
        return (
          (relationship.sourceId === node.id &&
            relationship.targetId === prevNode?.id) ||
          (relationship.sourceId === prevNode?.id &&
            relationship.targetId === node.id)
        );
      });

      pathRelationships.push(...edges);
    }
  });
  return pathRelationships;
};

export const calculateGraphStatistics = (graph: GraphDocumentForFrontend) => {
  const { nodes: graphNodes, relationships: graphLinks } = graph;

  // 1. 次数計算
  const degrees = new Map<string, number>();
  graphNodes.forEach((n) => degrees.set(n.id, 0));
  graphLinks.forEach((l) => {
    degrees.set(l.sourceId, (degrees.get(l.sourceId) ?? 0) + 1);
    degrees.set(l.targetId, (degrees.get(l.targetId) ?? 0) + 1);
  });

  // ハブ（次数上位）の抽出
  const topDegreeNodes = [...graphNodes]
    .sort((a, b) => {
      return (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0);
    })
    .slice(0, 5) // 上位5件
    .map((n) => ({ ...n, degree: degrees.get(n.id) ?? 0 }));

  // 2. 直径と平均ホップ数の計算
  const adj = new Map<string, string[]>();
  graphNodes.forEach((n) => adj.set(n.id, []));
  graphLinks.forEach((l) => {
    if (!adj.has(l.sourceId)) adj.set(l.sourceId, []);
    if (!adj.has(l.targetId)) adj.set(l.targetId, []);

    adj.get(l.sourceId)!.push(l.targetId);
    adj.get(l.targetId)!.push(l.sourceId);
  });

  let maxDist = 0;
  let totalDist = 0;
  let pathCount = 0;

  // 計算コスト削減のため、ノード数が多すぎる場合はサンプリング
  const calculationNodes =
    graphNodes.length > 500
      ? topDegreeNodes
          .map((n) => graphNodes.find((gn) => gn.id === n.id))
          .filter((n): n is NodeTypeForFrontend => !!n)
      : graphNodes;

  for (const startNode of calculationNodes) {
    const dists = bfsDistances(startNode.id, adj);

    // 統計情報の更新
    for (const d of dists.values()) {
      if (d > maxDist) maxDist = d;
      if (d > 0) {
        totalDist += d;
        pathCount++;
      }
    }
  }

  const avgPathLength = pathCount > 0 ? totalDist / pathCount : 0;

  return {
    topDegreeNodes,
    diameter: maxDist,
    avgPathLength,
  };
};

const bfsDistances = (startId: string, adj: Map<string, string[]>) => {
  const dists = new Map<string, number>();
  const queue = [startId];
  dists.set(startId, 0);

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++]!;
    const d = dists.get(u)!;

    const neighbors = adj.get(u) ?? [];
    for (const v of neighbors) {
      if (!dists.has(v)) {
        dists.set(v, d + 1);
        queue.push(v);
      }
    }
  }
  return dists;
};
