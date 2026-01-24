import { z } from "zod";

// GraphDocumentForFrontendのスキーマ（メタグラフ用）
const MetaGraphFrontendSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      label: z.string(),
      properties: z.record(
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      ),
      topicSpaceId: z.string().optional(),
      documentGraphId: z.string().optional(),
    }),
  ),
  relationships: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      properties: z.record(
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      ),
      sourceId: z.string(),
      targetId: z.string(),
      topicSpaceId: z.string().optional(),
      documentGraphId: z.string().optional(),
    }),
  ),
});

// MetaGraphStoryDataのスキーマ
export const MetaGraphStoryDataSchema = z.object({
  metaGraph: MetaGraphFrontendSchema,
  metaNodes: z.array(
    z.object({
      communityId: z.string(),
      memberNodeIds: z.array(z.string()),
      size: z.number(),
      hasExternalConnections: z.boolean(),
    }),
  ),
  communityMap: z.record(z.string(), z.string()), // nodeId -> communityId
  summaries: z.array(
    z.object({
      communityId: z.string(),
      title: z.string(),
      summary: z.string(),
    }),
  ),
  narrativeFlow: z.array(
    z.object({
      communityId: z.string(),
      order: z.number(),
      transitionText: z.string(),
    }),
  ),
  detailedStories: z.record(z.string(), z.union([z.string(), z.any()])), // communityId -> story (string or JSONContent)
  preparedCommunities: z.array(
    z.object({
      communityId: z.string(),
      memberNodeNames: z.array(z.string()),
      memberNodeLabels: z.array(z.string()).optional(),
      internalEdges: z.string().optional(),
      externalConnections: z.string().optional(),
      memberNodes: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            label: z.string(),
            properties: z.record(z.any()).optional(),
          }),
        )
        .optional(),
      internalEdgesDetailed: z
        .array(
          z.object({
            sourceId: z.string(),
            sourceName: z.string(),
            targetId: z.string(),
            targetName: z.string(),
            type: z.string(),
            properties: z.record(z.any()).optional(),
          }),
        )
        .optional(),
    }),
  ),
});

export type MetaGraphStoryDataInput = z.infer<typeof MetaGraphStoryDataSchema>;
