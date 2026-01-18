import { z } from "zod";
import type { LayoutInstruction, FilterCondition } from "@/app/const/types";

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

// ===== KG Router用のスキーマ =====

// フロントエンド用のグラフドキュメントスキーマ（propertiesの型が異なる）
export const GraphDocumentFrontendSchema = z.object({
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

export const CuratorialContextSchema = z
  .object({
    stance: z.string().optional(),
    extractionRules: z
      .union([z.record(z.unknown()), z.array(z.unknown())])
      .optional(),
    negativeArchive: z.array(z.string()).optional(),
  })
  .catchall(z.unknown());

// FilterConditionの再帰的なスキーマ定義（z.lazyを使用）
const FilterConditionSchema: z.ZodType<FilterCondition> = z.lazy(() =>
  z.union([
    // リーフ条件
    z.object({
      type: z.literal("condition"),
      field: z.union([z.literal("label"), z.literal("name"), z.string()]),
      operator: z.enum([
        "equals",
        "in",
        "contains",
        "date_equals",
        "date_after",
        "date_before",
        "date_range",
      ]),
      value: z.union([
        z.string(),
        z.array(z.string()),
        z.object({
          from: z.string(),
          to: z.string(),
        }),
      ]),
    }),
    // グループ条件（再帰的）
    z.object({
      type: z.literal("group"),
      logic: z.enum(["AND", "OR"]),
      conditions: z.array(FilterConditionSchema),
    }),
  ]),
);

// LayoutInstructionのスキーマ定義
export const LayoutInstructionSchema: z.ZodType<LayoutInstruction> = z.object({
  layout_strategy: z.string().optional(),
  forces: z
    .object({
      x_axis: z
        .object({
          type: z.enum(["timeline", "category_separation", "linear", "none"]),
          attribute: z.string().optional(),
          groups: z.record(z.union([z.string(), z.number()])).optional(),
          strength: z.number().optional(),
        })
        .optional(),
      y_axis: z
        .object({
          type: z.enum(["timeline", "category_separation", "linear", "none"]),
          attribute: z.string().optional(),
          groups: z.record(z.union([z.string(), z.number()])).optional(),
          strength: z.number().optional(),
        })
        .optional(),
      charge: z
        .object({
          strength: z.number().optional(),
        })
        .optional(),
      focus_nodes: z
        .object({
          targetNodeIds: z.array(z.string()),
          chargeMultiplier: z.number(),
        })
        .optional(),
      highlight_nodes: z
        .object({
          targetNodeIds: z.array(z.string()),
          color: z.string(),
        })
        .optional(),
      center_nodes: z
        .object({
          targetNodeIds: z.array(z.string()),
        })
        .optional(),
    })
    .optional(),
  filter: z
    .object({
      centerNodeIds: z.array(z.string()).optional(),
      maxHops: z.number().optional(),
      condition: FilterConditionSchema.optional(),
      includeNeighbors: z.boolean().optional(),
    })
    .optional(),
});

export const AskCopilotInputSchema = z.object({
  workspaceId: z.string(),
  query: z.string(),
  currentGraphData: GraphDocumentFrontendSchema.optional(),
  curatorialContext: CuratorialContextSchema.optional().nullable(),
  currentLayoutInstruction: LayoutInstructionSchema.nullable().optional(),
});

export const AskCopilotOutputSchema = z.object({
  reply: z.string(),
  rawResponse: z.string(),
  layoutInstruction: LayoutInstructionSchema.nullable(),
  filteredGraphData: GraphDocumentFrontendSchema.optional(),
});

export const PreparedCommunitySchema = z.object({
  communityId: z.string(),
  memberNodeNames: z.array(z.string()),
  memberNodeLabels: z.array(z.string()).optional(),
  internalEdges: z.string().optional(), // コミュニティ内のエッジ情報
  externalConnections: z.string().optional(), // 他のコミュニティへの接続情報
  // 詳細情報（optional）
  memberNodes: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        label: z.string(),
        properties: z.record(z.any()),
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
});

export type PreparedCommunity = z.infer<typeof PreparedCommunitySchema>;

export const ExtractInputSchema = z.object({
  fileUrl: z.string().url(),
  extractMode: z.string().optional(),
  isPlaneTextMode: z.boolean(),
  additionalPrompt: z.string().optional(),
  customMappingRules: z
    .object({
      sampleText: z.string(),
      chunks: z.array(
        z.object({
          text: z.string(),
          type: z.string(),
          startIndex: z.number(),
          endIndex: z.number(),
          suggestedRole: z.enum([
            "node",
            "node_property",
            "edge_property",
            "edge",
            "ignore",
          ]),
        }),
      ),
      mappings: z.array(
        z.object({
          chunkIndex: z.number(),
          role: z.enum([
            "node",
            "node_property",
            "edge_property",
            "edge",
            "ignore",
          ]),
          nodeLabel: z.string().optional(),
          propertyName: z.string().optional(),
          edgePropertyName: z.string().optional(),
          relationshipType: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

export const AnalyzeTextStructureInputSchema = z.object({
  sampleText: z.string(),
});

export const ConvertToEdgeTypeInputSchema = z.object({
  text: z.string(),
});

export const TestInspectInputSchema = z.object({
  fileUrl: z.string().url(),
  isPlaneTextMode: z.boolean(),
});

export const IntegrateGraphInputSchema = z.object({
  topicSpaceId: z.string(),
  graphDocument: KnowledgeGraphInputSchema,
});

export const GetNodesByIdsInputSchema = z.object({
  nodeIds: z.array(z.string()),
});

export const GetRelatedNodesInputSchema = z.object({
  nodeId: z.string(),
  contextId: z.string(),
  contextType: z.enum(["topicSpace", "document"]),
});

export const DocumentSchema = z.object({
  pageContent: z.string(),
  metadata: z.record(z.any()),
});

export const ExtractPhase1InputSchema = z.object({
  documents: z.array(DocumentSchema),
  schema: z
    .object({
      allowedNodes: z.array(z.string()),
      allowedRelationships: z.array(z.string()),
    })
    .optional(),
  additionalPrompt: z.string().optional(),
  customMappingRules: ExtractInputSchema.shape.customMappingRules,
});

export const ExtractPhase2InputSchema = ExtractPhase1InputSchema.extend({
  contextualInfo: z.string(),
});

export const NodeInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  properties: z.record(z.string()),
});

export const RelationshipInputSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  type: z.string(),
  properties: z.record(z.string()),
});

export const FinalizeGraphInputSchema = z.object({
  nodes: z.array(NodeInputSchema),
  relationships: z.array(RelationshipInputSchema),
});

export type NodeSchema = {
  entity: string;
  type: string;
};
