import type {
  GraphDocumentForFrontend,
  LocaleEnum,
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
  preferredLocale?: LocaleEnum;
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
      formNodeDataForFrontend(node, graph.preferredLocale),
    ),
    relationships: links.map((link) => formRelationshipDataForFrontend(link)),
  };
};

export const formTopicSpaceForFrontendPrivate = ({
  topicSpace,
  filterOption,
  preferredLocale,
}: {
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
  };
  filterOption?: TopicGraphFilterOption;
  preferredLocale?: LocaleEnum;
}) => {
  if (!!filterOption) {
    const filteredGraph = filterGraph(
      filterOption,
      topicSpace.id,
      formGraphDataForFrontend({
        preferredLocale: preferredLocale,
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
        preferredLocale: preferredLocale,
        nodes: topicSpace.nodes,
        relationships: topicSpace.relationships,
      }),
      sourceDocuments: topicSpace.sourceDocuments?.map((doc) => ({
        ...doc,
        graph:
          doc.graph && doc.graph.graphNodes && doc.graph.graphRelationships
            ? formDocumentGraphForFrontend(doc.graph, preferredLocale)
            : null,
      })),
      tags: topicSpace.tags,
      admins: topicSpace.admins,
    };
  }
};

export const formTopicSpaceForFrontendPublic = (
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
    admins?: { id: string }[];
  },
  filterOption: TopicGraphFilterOption,
  preferredLocale?: LocaleEnum,
) => {
  if (!!filterOption) {
    const filteredGraph = filterGraph(
      filterOption,
      topicSpace.id,
      formGraphDataForFrontend({
        preferredLocale: preferredLocale,
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
        preferredLocale: preferredLocale,
        nodes: topicSpace.nodes,
        relationships: topicSpace.relationships,
      }),
      sourceDocuments: topicSpace.sourceDocuments?.map((doc) => ({
        ...doc,
        graph:
          doc.graph && doc.graph.graphNodes && doc.graph.graphRelationships
            ? formDocumentGraphForFrontend(doc.graph, preferredLocale)
            : null,
      })),
      tags: topicSpace.tags,
      admins: topicSpace.admins,
    };
  }
};

export const formDocumentGraphForFrontend = (
  documentGraph: DocumentGraph & {
    graphNodes: GraphNode[];
    graphRelationships: GraphRelationship[];
  },
  preferredLocale?: LocaleEnum,
) => {
  return {
    ...documentGraph,
    dataJson: formGraphDataForFrontend({
      preferredLocale: preferredLocale,
      nodes: documentGraph.graphNodes,
      relationships: documentGraph.graphRelationships,
    }),
  };
};

export const formGraphDataForFrontend = ({
  preferredLocale,
  nodes,
  relationships,
}: {
  preferredLocale?: LocaleEnum;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}) => {
  return {
    nodes: nodes.map((node) => formNodeDataForFrontend(node, preferredLocale)),
    relationships: relationships.map((rel) =>
      formRelationshipDataForFrontend(rel),
    ),
  };
};

export const formNodeDataForFrontend = (
  node: GraphNode,
  preferredLocale?: LocaleEnum,
): NodeTypeForFrontend => {
  const nodeName = preferredLocale
    ? (node.properties as Record<string, string>)?.[`name_${preferredLocale}`]
    : node.name;

  return {
    id: node.id,
    name: nodeName ?? node.name,
    label: node.label,
    properties: node.properties as PropertyTypeForFrontend,
    topicSpaceId: node.topicSpaceId ?? undefined,
    documentGraphId: node.documentGraphId ?? undefined,
  };
};

export const formRelationshipDataForFrontend = (
  relationship: GraphRelationship,
): RelationshipTypeForFrontend => {
  return {
    id: relationship.id,
    type: relationship.type,
    sourceId: relationship.fromNodeId,
    targetId: relationship.toNodeId,
    properties: relationship.properties as PropertyTypeForFrontend,
    topicSpaceId: relationship.topicSpaceId ?? undefined,
    documentGraphId: relationship.documentGraphId ?? undefined,
  };
};
