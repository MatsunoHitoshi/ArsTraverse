import type {
  GraphDocumentForFrontend,
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
  TreeNode,
} from "@/app/const/types";

export const getTreeLayoutData = (
  graph: GraphDocumentForFrontend,
  nodeId: string,
  edgeType: EdgeType,
) => {
  const centerNode = graph.nodes.find((node) => node.id === nodeId);
  if (!centerNode) return null;
  let treeData: TreeNode = centerNode as unknown as TreeNode;

  treeData = buildTreeNode(graph, centerNode, edgeType, 2);

  return treeData;
};

export const sourceLinks = (
  links: RelationshipTypeForFrontend[],
  nodeId: string,
) =>
  links.filter((link) => {
    return link.sourceId === nodeId;
  });

export const targetLinks = (
  links: RelationshipTypeForFrontend[],
  nodeId: string,
) =>
  links.filter((link) => {
    return link.targetId === nodeId;
  });

const getNodeById = (id: string, nodes: NodeTypeForFrontend[]) => {
  return nodes.find((node) => {
    return node.id === id;
  });
};

export type EdgeType = "IN" | "OUT" | "BOTH";
export const getNeighborNodes = (
  graph: GraphDocumentForFrontend,
  nodeId: string,
  edgeType: EdgeType,
): NodeTypeForFrontend[] => {
  switch (edgeType) {
    case "IN":
      const inNodes = targetLinks(graph.relationships, nodeId).map((link) => {
        return getNodeById(link.sourceId, graph.nodes);
      });
      return inNodes
        .filter((node): node is NodeTypeForFrontend => {
          return node !== undefined;
        })
        .filter((node, index, self) => {
          return index === self.findIndex((n) => n.id === node.id);
        });
    case "OUT":
      const outNodes = sourceLinks(graph.relationships, nodeId).map((link) => {
        return getNodeById(link.targetId, graph.nodes);
      });
      return outNodes
        .filter((node): node is NodeTypeForFrontend => {
          return node !== undefined;
        })
        .filter((node, index, self) => {
          return index === self.findIndex((n) => n.id === node.id);
        });
    case "BOTH":
      const bothNodes = targetLinks(graph.relationships, nodeId)
        .map((link) => {
          return getNodeById(link.sourceId, graph.nodes);
        })
        .concat(
          sourceLinks(graph.relationships, nodeId).map((link) => {
            return getNodeById(link.targetId, graph.nodes);
          }),
        );
      return bothNodes
        .filter((node): node is NodeTypeForFrontend => {
          return node !== undefined;
        })
        .filter((node, index, self) => {
          return index === self.findIndex((n) => n.id === node.id);
        });
  }
};

export const buildTreeNode = (
  graph: GraphDocumentForFrontend,
  node: NodeTypeForFrontend,
  edgeType: EdgeType,
  depth: number,
): TreeNode => {
  if (depth === 0) return { id: node.id, name: node.name, children: [] };
  return {
    id: node.id,
    name: node.name,
    label: node.label,
    children: getNeighborNodes(graph, node.id, edgeType).map((child) =>
      buildTreeNode(graph, child, edgeType, depth - 1),
    ),
  };
};
