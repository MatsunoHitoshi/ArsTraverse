import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { GraphChangeType } from "@prisma/client";
import type {
  NodeDiffType,
  RelationshipDiffType,
} from "./get-nodes-and-relationships-from-result";

const shapeRelationshipData = (
  relationship: RelationshipTypeForFrontend,
): RelationshipTypeForFrontend => {
  return {
    id: relationship.id,
    type: relationship.type,
    properties: relationship.properties,
    sourceId: relationship.sourceId,
    targetId: relationship.targetId,
    documentGraphId: relationship.documentGraphId,
    topicSpaceId: relationship.topicSpaceId,
  };
};

const shapeNodeData = (node: NodeTypeForFrontend): NodeTypeForFrontend => {
  return {
    id: node.id,
    name: node.name,
    label: node.label,
    properties: node.properties,
    topicSpaceId: node.topicSpaceId,
    documentGraphId: node.documentGraphId,
  };
};

export const diffNodes = (
  originalNodes: NodeTypeForFrontend[],
  updatedNodes: NodeTypeForFrontend[],
): NodeDiffType[] => {
  const diffNodes = originalNodes
    .map((node) => {
      const sameIdNode = updatedNodes.find(
        (updatedNode) => updatedNode.id === node.id,
      );
      const isUpdated =
        sameIdNode?.name !== node.name ||
        sameIdNode?.label !== node.label ||
        JSON.stringify(sameIdNode?.properties) !==
          JSON.stringify(node.properties);
      if (sameIdNode && isUpdated) {
        return {
          type: GraphChangeType.UPDATE,
          original: shapeNodeData(node),
          updated: shapeNodeData(sameIdNode),
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const addedNodes = updatedNodes
    .map((node) => {
      if (!originalNodes.some((originalNode) => originalNode.id === node.id)) {
        return {
          type: GraphChangeType.ADD,
          original: null,
          updated: shapeNodeData(node),
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const removedNodes = originalNodes
    .map((node) => {
      if (!updatedNodes.some((updatedNode) => updatedNode.id === node.id)) {
        return {
          type: GraphChangeType.REMOVE,
          original: shapeNodeData(node),
          updated: null,
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return [...diffNodes, ...addedNodes, ...removedNodes];
};

export const diffRelationships = (
  originalRelationships: RelationshipTypeForFrontend[],
  updatedRelationships: RelationshipTypeForFrontend[],
): RelationshipDiffType[] => {
  const diffRelationships = originalRelationships
    .map((relationship) => {
      const sameIdRelationship = updatedRelationships.find(
        (updatedRelationship) => updatedRelationship.id === relationship.id,
      );
      const isUpdated =
        sameIdRelationship?.sourceId !== relationship.sourceId ||
        sameIdRelationship?.targetId !== relationship.targetId ||
        sameIdRelationship?.type !== relationship.type ||
        JSON.stringify(sameIdRelationship?.properties) !==
          JSON.stringify(relationship.properties);

      if (sameIdRelationship && isUpdated) {
        return {
          type: GraphChangeType.UPDATE,
          original: shapeRelationshipData(relationship),
          updated: shapeRelationshipData(sameIdRelationship),
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const addedRelationships = updatedRelationships
    .map((relationship) => {
      if (
        !originalRelationships.some(
          (originalRelationship) => originalRelationship.id === relationship.id,
        )
      ) {
        return {
          type: GraphChangeType.ADD,
          original: null,
          updated: shapeRelationshipData(relationship),
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const removedRelationships = originalRelationships
    .map((relationship) => {
      if (
        !updatedRelationships.some(
          (updatedRelationship) => updatedRelationship.id === relationship.id,
        )
      ) {
        return {
          type: GraphChangeType.REMOVE,
          original: shapeRelationshipData(relationship),
          updated: null,
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return [...diffRelationships, ...addedRelationships, ...removedRelationships];
};
