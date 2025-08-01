import type {
  GraphDocumentForFrontend,
  NodeTypeForFrontend,
  PropertyTypeForFrontend,
  RelationshipTypeForFrontend,
  TopicGraphFilterOption,
} from "@/app/const/types";
import type {
  DocumentGraph,
  GraphNode,
  GraphRelationship,
  SourceDocument,
  Tag,
  TopicSpace,
  User,
} from "@prisma/client";
import { filterGraph } from "./filter";

export const addStaticPropertiesForFrontend = (graph: {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}): GraphDocumentForFrontend => {
  const nodes = graph.nodes;
  const links = graph.relationships;

  const nodesWithStaticProperties = nodes.map((node) => {
    const neighborLinkCount = links.filter((link) => {
      return link.fromNodeId === node.id || link.toNodeId === node.id;
    }).length;

    return {
      ...node,
      neighborLinkCount,
    };
  });

  return {
    nodes: nodesWithStaticProperties.map((node) =>
      formNodeDataForFrontend(node),
    ),
    relationships: links.map((link) => formRelationshipDataForFrontend(link)),
  };
};

const getNeighborLinkCount = (
  node: GraphNode,
  links: GraphRelationship[],
): number => {
  return links.filter((link) => {
    return link.fromNodeId === node.id || link.toNodeId === node.id;
  }).length;
};

export const formTopicSpaceForFrontendPrivate = (
  topicSpace: TopicSpace & {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
    sourceDocuments?: (SourceDocument & {
      graph:
        | (DocumentGraph & {
            graphNodes: GraphNode[];
            graphRelationships: GraphRelationship[];
          })
        | null;
    })[];
    tags?: Tag[];
    admins?: User[];
  },
  filterOption?: TopicGraphFilterOption,
) => {
  if (!!filterOption) {
    const filteredGraph = filterGraph(
      filterOption,
      topicSpace.id,
      formGraphDataForFrontend({
        nodes: topicSpace.nodes,
        relationships: topicSpace.relationships,
      }),
    );
    return {
      ...topicSpace,
      graphData: filteredGraph,
    };
  } else {
    return {
      ...topicSpace,
      graphData: addStaticPropertiesForFrontend({
        nodes: topicSpace.nodes,
        relationships: topicSpace.relationships,
      }),
      sourceDocuments: topicSpace.sourceDocuments?.map((doc) => ({
        ...doc,
        graph: doc.graph ? formDocumentGraphForFrontend(doc.graph) : null,
      })),
      tags: topicSpace.tags,
      admins: topicSpace.admins,
    };
  }
};

export const formTopicSpaceForFrontendPublic = (
  topicSpace: Omit<TopicSpace, "admins"> & {
    nodes: GraphNode[];
    relationships: GraphRelationship[];
    sourceDocuments?: (SourceDocument & {
      graph:
        | (DocumentGraph & {
            graphNodes: GraphNode[];
            graphRelationships: GraphRelationship[];
          })
        | null;
    })[];
    tags?: Tag[];
  },
  filterOption?: TopicGraphFilterOption,
) => {
  if (!!filterOption) {
    const filteredGraph = filterGraph(
      filterOption,
      topicSpace.id,
      formGraphDataForFrontend({
        nodes: topicSpace.nodes,
        relationships: topicSpace.relationships,
      }),
    );
    return {
      ...topicSpace,
      graphData: filteredGraph,
    };
  } else {
    return {
      ...topicSpace,
      graphData: addStaticPropertiesForFrontend({
        nodes: topicSpace.nodes,
        relationships: topicSpace.relationships,
      }),
      sourceDocuments: topicSpace.sourceDocuments?.map((doc) => ({
        ...doc,
        graph: doc.graph ? formDocumentGraphForFrontend(doc.graph) : null,
      })),
      tags: topicSpace.tags,
    };
  }
};

export const formDocumentGraphForFrontend = (
  documentGraph: DocumentGraph & {
    graphNodes: GraphNode[];
    graphRelationships: GraphRelationship[];
  },
) => {
  return {
    ...documentGraph,
    dataJson: formGraphDataForFrontend({
      nodes: documentGraph.graphNodes,
      relationships: documentGraph.graphRelationships,
    }),
  };
};

export const formGraphDataForFrontend = ({
  nodes,
  relationships,
}: {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}) => {
  return {
    nodes: nodes.map((node) => formNodeDataForFrontend(node)),
    relationships: relationships.map((rel) =>
      formRelationshipDataForFrontend(rel),
    ),
  };
};

export const formNodeDataForFrontend = (
  node: GraphNode,
): NodeTypeForFrontend => {
  return {
    ...node,
    properties: node.properties as PropertyTypeForFrontend,
    topicSpaceId: node.topicSpaceId ?? undefined,
    documentGraphId: node.documentGraphId ?? undefined,
  };
};

export const formRelationshipDataForFrontend = (
  relationship: GraphRelationship,
): RelationshipTypeForFrontend => {
  return {
    ...relationship,
    sourceId: relationship.fromNodeId,
    targetId: relationship.toNodeId,
    properties: relationship.properties as PropertyTypeForFrontend,
    topicSpaceId: relationship.topicSpaceId ?? undefined,
    documentGraphId: relationship.documentGraphId ?? undefined,
  };
};
