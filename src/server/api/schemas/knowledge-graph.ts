import { z } from "zod";

// ノードのプロパティスキーマ
const PropertyTypeSchema = z.record(z.string(), z.string());

// ノードスキーマ
const NodeTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  properties: PropertyTypeSchema.optional().default({}),
  topicSpaceId: z.string().optional(),
  documentGraphId: z.string().optional(),
  neighborLinkCount: z.number().optional(),
  visible: z.boolean().optional(),
  clustered: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  nodeColor: z.string().optional(),
  isAdditional: z.boolean().optional(),
  isMergeTarget: z.boolean().optional(),
  isExistingContext: z.boolean().optional(),
});

// リレーションシップスキーマ
const RelationshipTypeSchema = z.object({
  id: z.string(),
  type: z.string(),
  properties: PropertyTypeSchema.optional().default({}),
  sourceId: z.string(),
  targetId: z.string(),
  topicSpaceId: z.string().optional(),
  documentGraphId: z.string().optional(),
  isAdditional: z.boolean().optional(),
  isExistingContext: z.boolean().optional(),
});

// 知識グラフ入力スキーマ
export const KnowledgeGraphInputSchema = z.object({
  nodes: z.array(NodeTypeSchema),
  relationships: z.array(RelationshipTypeSchema),
});
