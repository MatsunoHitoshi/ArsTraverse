import type { MetaGraphStoryData } from "@/app/_hooks/use-meta-graph-story";
import type {
  Story,
  MetaGraphNode,
  MetaGraphRelationship,
  CommunitySummary,
  CommunityStory,
  GraphNode,
} from "@prisma/client";
import type { JSONContent } from "@tiptap/react";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import type { MetaGraphStoryDataInput } from "@/server/api/schemas/meta-graph-story";
import type { LayoutInstruction } from "@/app/const/types";

// DBから読み込んだStory関連データの型
export type StoryWithRelations = Story & {
  metaNodes: (MetaGraphNode & {
    memberNodes: GraphNode[];
    summary: CommunitySummary | null;
    storyContent: CommunityStory | null;
  })[];
  metaEdges: (MetaGraphRelationship & {
    fromMetaNode: MetaGraphNode;
    toMetaNode: MetaGraphNode;
  })[];
};

/**
 * Zodスキーマから推論されたpropertiesをPrismaのJson型に変換
 */
function convertPropertiesFromInput(
  properties: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  // PrismaのJson型はこの型を受け入れる
  return properties;
}

/**
 * MetaGraphStoryDataをDB構造に変換
 */
export function convertToDatabase(
  data: MetaGraphStoryDataInput,
  workspaceId: string,
  referencedTopicSpaceId: string,
): {
  story: {
    workspaceId: string;
    referencedTopicSpaceId: string;
  };
  metaNodes: Array<{
    name: string;
    label: string;
    properties: Record<string, string | number | boolean | null>;
    storyId: string;
    communityId: string;
    size: number;
    hasExternalConnections: boolean;
    memberNodeIds: string[];
  }>;
  metaEdges: Array<{
    type: string;
    properties: Record<string, string | number | boolean | null>;
    storyId: string;
    fromCommunityId: string;
    toCommunityId: string;
  }>;
  summaries: Array<{
    communityId: string;
    title: string;
    summary: string;
    order: number | null;
    transitionText: string | null;
  }>;
  stories: Array<{
    communityId: string;
    story: string | JSONContent;
  }>;
} {
  // communityId -> MetaGraphNode.id のマッピングを作成
  const communityIdToMetaNodeId = new Map<string, string>();

  // MetaGraphNodeを作成
  const metaNodes = data.metaGraph.nodes.map((node) => {
    const metaNodeData = data.metaNodes.find(
      (mn) => mn.communityId === node.id,
    );
    if (!metaNodeData) {
      throw new Error(`MetaNode data not found for communityId: ${node.id}`);
    }

    // 一時的なIDを生成（実際のDB保存時にPrismaが生成）
    const tempId = `temp_${node.id}`;
    communityIdToMetaNodeId.set(node.id, tempId);

    return {
      name: node.name,
      label: node.label,
      properties: convertPropertiesFromInput(node.properties),
      storyId: "", // 後で設定
      communityId: node.id,
      size: metaNodeData.size,
      hasExternalConnections: metaNodeData.hasExternalConnections,
      memberNodeIds: metaNodeData.memberNodeIds,
    };
  });

  // MetaGraphRelationshipを作成
  const metaEdges = data.metaGraph.relationships.map((rel) => {
    return {
      type: rel.type,
      properties: convertPropertiesFromInput(rel.properties),
      storyId: "", // 後で設定
      fromCommunityId: rel.sourceId,
      toCommunityId: rel.targetId,
    };
  });

  // CommunitySummaryを作成（communityIdを保持）
  const summaries = data.summaries.map((summary) => {
    const narrativeFlowItem = data.narrativeFlow.find(
      (nf) => nf.communityId === summary.communityId,
    );

    return {
      communityId: summary.communityId, // communityIdを保持
      title: summary.title,
      summary: summary.summary,
      order: narrativeFlowItem?.order ?? null,
      transitionText: narrativeFlowItem?.transitionText ?? null,
    };
  });

  // CommunityStoryを作成（communityIdを保持）
  const stories = Object.entries(data.detailedStories).map(
    ([communityId, story]) => {
      return {
        communityId: communityId, // communityIdを保持
        story: story as string | JSONContent,
      };
    },
  );

  return {
    story: {
      workspaceId,
      referencedTopicSpaceId,
    },
    metaNodes,
    metaEdges,
    summaries,
    stories,
  };
}

/**
 * Json型のpropertiesをPropertyTypeForFrontendに変換
 */
function convertPropertiesToFrontend(
  properties: unknown,
): Record<string, string> {
  if (typeof properties !== "object" || properties === null) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    // null, undefined, number, booleanを文字列に変換
    if (value === null || value === undefined) {
      result[key] = "";
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = String(value);
    } else {
      result[key] = String(value);
    }
  }
  return result;
}

/**
 * DB構造からMetaGraphStoryDataに変換
 */
export function convertFromDatabase(
  storyData: StoryWithRelations,
): MetaGraphStoryData {
  // MetaGraphNodeからメタグラフのノードとエッジを構築
  const nodes: NodeTypeForFrontend[] = storyData.metaNodes.map((metaNode) => ({
    id: metaNode.communityId,
    name: metaNode.name,
    label: metaNode.label,
    properties: convertPropertiesToFrontend(metaNode.properties),
  }));

  const relationships: RelationshipTypeForFrontend[] = storyData.metaEdges.map(
    (edge) => ({
      id: edge.id,
      type: edge.type,
      properties: convertPropertiesToFrontend(edge.properties),
      sourceId: edge.fromMetaNode.communityId,
      targetId: edge.toMetaNode.communityId,
    }),
  );

  // metaNodes配列を構築
  const metaNodes = storyData.metaNodes.map((metaNode) => ({
    communityId: metaNode.communityId,
    memberNodeIds: metaNode.memberNodes.map((node) => node.id),
    size: metaNode.size,
    hasExternalConnections: metaNode.hasExternalConnections,
  }));

  // communityMapを構築（nodeId -> communityId）
  const communityMap: Record<string, string> = {};
  storyData.metaNodes.forEach((metaNode) => {
    metaNode.memberNodes.forEach((node) => {
      communityMap[node.id] = metaNode.communityId;
    });
  });

  // summaries配列を構築
  const summaries = storyData.metaNodes
    .filter((metaNode) => metaNode.summary !== null)
    .map((metaNode) => ({
      communityId: metaNode.communityId,
      title: metaNode.summary!.title,
      summary: metaNode.summary!.summary,
    }));

  // narrativeFlow配列を構築（orderがnullでないもの）
  const narrativeFlow = storyData.metaNodes
    .filter((metaNode) => metaNode.summary?.order !== null)
    .map((metaNode) => ({
      communityId: metaNode.communityId,
      order: metaNode.summary!.order!,
      transitionText: metaNode.summary!.transitionText ?? "",
    }))
    .sort((a, b) => a.order - b.order);

  // detailedStoriesを構築（string または Tiptap JSONContent）
  const detailedStories: Record<string, string | JSONContent> = {};
  storyData.metaNodes.forEach((metaNode) => {
    if (metaNode.storyContent) {
      const storyValue = metaNode.storyContent.story;
      if (typeof storyValue === "string") {
        detailedStories[metaNode.communityId] = storyValue;
      } else {
        detailedStories[metaNode.communityId] = storyValue as JSONContent;
      }
    }
  });

  // preparedCommunitiesを構築（ストーリー再生成・追加可能リストで参照するため全コミュニティを返す）
  const preparedCommunities = storyData.metaNodes
    .filter((metaNode) => metaNode.summary !== null)
    .map((metaNode) => ({
      communityId: metaNode.communityId,
      memberNodeNames: metaNode.memberNodes.map((node) => node.name),
      memberNodeLabels: metaNode.memberNodes.map((node) => node.label),
      // これらの情報はDBに保存されていないため、空にする
      internalEdges: undefined,
      externalConnections: metaNode.hasExternalConnections
        ? "Has external connections"
        : undefined,
    }));

  return {
    metaGraph: {
      nodes,
      relationships,
    },
    metaNodes,
    communityMap,
    summaries,
    narrativeFlow,
    detailedStories,
    preparedCommunities,
    filter: storyData.filter
      ? (storyData.filter as LayoutInstruction["filter"])
      : undefined,
  };
}
