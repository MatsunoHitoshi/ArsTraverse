import type {
  GraphDocumentForFrontend,
  RelationshipTypeForFrontend,
  TopicGraphFilterOption,
} from "@/app/const/types";
import type { GraphNode, GraphRelationship } from "@prisma/client";
import { nodePathSearch } from "./bfs";
import { env } from "@/env";
import { createId } from "@/app/_utils/cuid/cuid";
import type { NodeTypeForFrontend } from "@/app/const/types";

export const filterGraph = (
  filterOption: TopicGraphFilterOption,
  topicSpaceId: string,
  graphData: GraphDocumentForFrontend,
) => {
  switch (filterOption.type) {
    case "tag":
      const tagFilteredNodes = graphData.nodes.filter((node) => {
        const properties = node.properties as { tag?: string };
        if (properties && typeof properties.tag === "string") {
          return (
            properties.tag.toLowerCase() === filterOption.value.toLowerCase()
          );
        } else {
          return false;
        }
      });
      let tagRelationships: RelationshipTypeForFrontend[] = [];

      if (filterOption.withBetweenNodes) {
        let betweenNodes: NodeTypeForFrontend[] = [];
        tagFilteredNodes.forEach((node, index) => {
          const next = tagFilteredNodes[index + 1];
          if (!!next) {
            const { relationships, nodes } = nodePathSearch(
              graphData,
              node.id,
              next.id,
            );
            tagRelationships = [
              ...tagRelationships,
              ...relationships.filter(
                (r) => !tagRelationships.some((tr) => tr.id === r.id),
              ),
            ];
            betweenNodes = [
              ...betweenNodes,
              ...nodes.filter(
                (r) => !betweenNodes.some((tr) => tr.id === r.id),
              ),
            ];
          }
        });
        return {
          nodes: [
            ...tagFilteredNodes,
            ...betweenNodes.filter(
              (r) => !tagFilteredNodes.some((tr) => tr.id === r.id),
            ),
          ],
          relationships: tagRelationships,
        };
      } else {
        const cutOff = Math.max(filterOption.cutOff ?? 5, 1);
        tagFilteredNodes.forEach((sourceNode, sIndex) => {
          tagFilteredNodes.forEach((targetNode, tIndex) => {
            if (sIndex > tIndex) {
              const nodesDistance =
                nodePathSearch(graphData, sourceNode.id, targetNode.id, cutOff)
                  .nodes.length - 1;
              if (nodesDistance > 0 && nodesDistance <= cutOff) {
                const r = {
                  id: createId(),
                  sourceId: sourceNode.id,
                  targetId: targetNode.id,
                  type: String(nodesDistance),
                  properties: {
                    distance: String(nodesDistance),
                    url: `${env.NEXT_PUBLIC_BASE_URL}/topic-spaces/${topicSpaceId}/path/${sourceNode.id}/${targetNode.id}`,
                  },
                  topicSpaceId: topicSpaceId,
                };
                tagRelationships = [...tagRelationships, r];
              }
            }
          });
        });
      }
      return { nodes: tagFilteredNodes, relationships: tagRelationships };

    case "label":
      const labelFilteredNodes = graphData.nodes.filter((node) => {
        return node.label.toLowerCase() === filterOption.value.toLowerCase();
      });

      let labelRelationships: RelationshipTypeForFrontend[] = [];
      let additionalNodes: NodeTypeForFrontend[] = [];

      labelFilteredNodes.forEach((node, index) => {
        const next = labelFilteredNodes[index + 1];
        if (!!next) {
          const { relationships, nodes } = nodePathSearch(
            graphData,
            node.id,
            next.id,
          );
          labelRelationships = [
            ...labelRelationships,
            ...relationships.filter(
              (r) => !labelRelationships.some((tr) => tr.id === r.id),
            ),
          ];
          additionalNodes = [
            ...additionalNodes,
            ...nodes.filter(
              (r) => !additionalNodes.some((tr) => tr.id === r.id),
            ),
          ];
        }
      });
      return {
        nodes: [
          ...labelFilteredNodes,
          ...additionalNodes.filter(
            (r) => !labelFilteredNodes.some((tr) => tr.id === r.id),
          ),
        ],
        relationships: labelRelationships,
      };
  }
};

export const updateKgProperties = (
  update: { nodes: GraphNode[]; relationships: GraphRelationship[] },
  graphData: { nodes: GraphNode[]; relationships: GraphRelationship[] },
) => {
  const updatedNodes = graphData.nodes.map((node) => {
    const updateNode = update.nodes.find((n) => n.id === node.id);
    return updateNode ?? node;
  });
  const updatedRelationships = graphData.relationships.map((relationship) => {
    const updateRelationship = update.relationships.find(
      (r) => r.id === relationship.id,
    );
    return updateRelationship ?? relationship;
  });
  return {
    nodes: updatedNodes,
    relationships: updatedRelationships,
  };
};

// 移動させたい
export const getNodeByIdForFrontend = (
  id: string,
  nodes: NodeTypeForFrontend[],
) => {
  return nodes.find((node) => {
    return node.id === id;
  });
};
