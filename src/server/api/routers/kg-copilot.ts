import { protectedProcedure } from "../trpc";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import type { LayoutInstruction } from "@/app/const/types";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import {
  analyzeGraphStructure,
  prepareAnalysisForLLM,
} from "@/app/_utils/kg/graph-analysis";
import {
  AskCopilotInputSchema,
  AskCopilotOutputSchema,
  GraphDocumentFrontendSchema,
  CuratorialContextSchema,
  PreparedCommunitySchema,
} from "../schemas/knowledge-graph";
import { filterGraphByLayoutInstruction } from "../../utils/filter-graph-by-layout-instruction";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { getTextReference } from "./source-document";

export const copilotProcedures = {
  askCopilot: protectedProcedure
    .input(AskCopilotInputSchema)
    .output(AskCopilotOutputSchema)
    .mutation(async ({ input }) => {
      const {
        query,
        currentGraphData,
        curatorialContext,
        currentLayoutInstruction,
      } = input;

      // ノード名からノードを検索するヘルパー関数
      const findNodeByName = (
        searchName: string,
        nodes: z.infer<typeof GraphDocumentFrontendSchema>["nodes"] | undefined,
      ) => {
        if (!nodes) return undefined;
        const lowerSearchName = searchName.toLowerCase().trim();

        // 1. 完全一致
        let matched = nodes.find(
          (node) => node.name.toLowerCase() === lowerSearchName,
        );
        if (matched) return matched;

        // 2. 部分一致（検索名がノード名に含まれる、またはその逆）
        matched = nodes.find(
          (node) =>
            node.name.toLowerCase().includes(lowerSearchName) ||
            lowerSearchName.includes(node.name.toLowerCase()),
        );
        if (matched) return matched;

        // 3. 類似度マッチング（「ヨーゼフ・ボイス」と「ヨハンナ・マリア・マルグレート・ボイス」のような場合）
        // キーワードで検索（より柔軟なマッチング）
        const keywords = lowerSearchName
          .split(/[\s・\-]/)
          .filter((k) => k.length > 1);
        if (keywords.length > 0) {
          // 最も多くのキーワードに一致するノードを探す
          let bestMatch: (typeof nodes)[number] | undefined;
          let bestScore = 0;
          nodes.forEach((node) => {
            const nodeNameLower = node.name.toLowerCase();
            const score = keywords.filter((keyword) =>
              nodeNameLower.includes(keyword),
            ).length;
            // すべてのキーワードが一致する場合を優先
            if (score === keywords.length && score > bestScore) {
              bestScore = score;
              bestMatch = node;
            }
            // すべてのキーワードが一致しない場合でも、最も多くのキーワードが一致するノードを記録
            else if (score > bestScore && bestScore < keywords.length) {
              bestScore = score;
              bestMatch = node;
            }
          });
          // 少なくとも1つのキーワードが一致し、かつ最もスコアが高い場合は返す
          if (bestMatch && bestScore > 0) {
            // 特に「ボイス」のような重要なキーワードが含まれている場合は優先
            const hasImportantKeyword = keywords.some((keyword) => {
              const keywordLength = keyword.length;
              // 3文字以上のキーワード、または「ボイス」のような固有名詞の一部
              return (
                keywordLength >= 3 &&
                bestMatch!.name.toLowerCase().includes(keyword)
              );
            });
            if (hasImportantKeyword || bestScore >= keywords.length * 0.5) {
              return bestMatch;
            }
          }
        }

        return undefined;
      };

      const llm = new ChatOpenAI({
        temperature: 0.3,
        model: "gpt-4o-mini", // より賢いモデルを使用
      });

      // グラフのメタデータを抽出
      let graphMetadata = "Graph data is not available.";
      if (currentGraphData?.nodes) {
        const nodes = currentGraphData.nodes;
        const nodeCount = nodes.length;
        // 最初の5つのノードのプロパティキーを収集して、利用可能な属性を推測
        const attributeKeys = new Set<string>();
        nodes.slice(0, 10).forEach((node) => {
          if (node.properties) {
            Object.keys(node.properties).forEach((key) =>
              attributeKeys.add(key),
            );
          }
        });
        graphMetadata = `Nodes: ${nodeCount}, Attributes: ${Array.from(
          attributeKeys,
        ).join(", ")}`;
      }

      // キュレトリアルコンテキストの整理
      const stance = curatorialContext?.stance
        ? `Stance: ${curatorialContext.stance}`
        : "Stance: Neutral/Undefined";
      const rules = curatorialContext?.extractionRules
        ? `Extraction Rules: ${JSON.stringify(curatorialContext.extractionRules)}`
        : "";

      // 現在のレイアウト指示を文字列化
      const currentLayoutInstructionText = currentLayoutInstruction
        ? `\n[Current Layout Instruction]\n${JSON.stringify(currentLayoutInstruction, null, 2)}\n\n**IMPORTANT**: When generating a new Layout Instruction, you MUST preserve all existing settings from the Current Layout Instruction that are not explicitly mentioned in the user's request. Merge the new settings with the existing ones. For example, if the current instruction has "x_axis" with "strength": 0.8 and the user only asks to change "y_axis", keep the "x_axis" settings unchanged.`
        : "";

      const systemPrompt = `You are "ArsTraverse Copilot", an AI assistant for curators.
Your goal is to help the user build, interpret, and visualize knowledge graphs.

[Curatorial Context]
${stance}
${rules}

[Current Graph Metadata]
${graphMetadata}
${currentLayoutInstructionText}
[Important Note about Node Names]
When the user mentions a node name (e.g., "ヨーゼフ・ボイス", "サイバネティクス"), you should use the node name directly in the Layout Instruction JSON. The backend will automatically resolve node names to their IDs using fuzzy matching. You do NOT need to look up node IDs manually.

[Instructions]
1. Answer the user's query in Japanese. Be helpful and insightful.
2. If the user asks to change the layout or visualization (e.g., "arrange by date", "separate admin and artists"), you MUST generate a "Layout Instruction" JSON.
3. If you generate a Layout Instruction, output it at the very end of your response, enclosed in a code block like this:
\`\`\`json
{
  "layout_strategy": "force_simulation",
  "forces": {
    "x_axis": { "type": "timeline", "attribute": "date_property", "strength": 0.8 },
    "y_axis": { "type": "category_separation", "attribute": "role_property", "groups": { "value1": "top", "value2": "bottom" }, "strength": 0.6 },
    "charge": { "strength": -300 },
    "focus_nodes": { "targetNodeIds": ["id1", "id2"], "chargeMultiplier": 2.0 }
  }
}
\`\`\`
Example for horizontal ellipse (横長の楕円型):
\`\`\`json
{
  "layout_strategy": "force_simulation",
  "forces": {
    "x_axis": { "type": "linear", "strength": 0.9 },
    "y_axis": { "type": "linear", "strength": 0.3 },
    "charge": { "strength": -300 }
  }
}
\`\`\`
4. For "x_axis" or "y_axis", use:
   - "timeline" for date/numeric properties (requires "attribute" field)
   - "category_separation" for categorical properties (requires "attribute" and "groups" fields)
   - "linear" for simple linear distribution without attributes (e.g., to create elliptical shapes like "横長の楕円型")
5. When using "linear" type:
   - For horizontal ellipse (横長の楕円型): x_axis with high strength (0.8-1.0), y_axis with low strength (0.2-0.4)
     * This makes nodes spread horizontally (wide) and compress vertically (narrow)
   - For vertical ellipse (縦長の楕円型): x_axis with low strength (0.2-0.4), y_axis with high strength (0.8-1.0)
     * This makes nodes compress horizontally (narrow) and spread vertically (tall)
   - "linear" type does NOT require "attribute" or "groups" fields
   - **IMPORTANT**: x_axis controls horizontal (left-right) direction, y_axis controls vertical (top-bottom) direction
6. Infer the correct property names from the [Current Graph Metadata] or common sense (e.g., "date", "year", "role", "type").
7. **IMPORTANT**: When the user mentions a node name (e.g., "ヨーゼフ・ボイス", "サイバネティクス"), you can use the node name directly in the Layout Instruction JSON. The backend will automatically resolve node names to their IDs using intelligent fuzzy matching. You do NOT need to look up node IDs manually - just use the node name as the user mentioned it.
9. **For centering nodes**: When the user asks to place a node in the center (e.g., "中央に配置"), use "center_nodes" instead of "focus_nodes":
\`\`\`json
{
  "layout_strategy": "force_simulation",
  "forces": {
    "center_nodes": {
      "targetNodeIds": ["actual_node_id"]
    }
  }
}
\`\`\`
Note: "focus_nodes" adjusts charge (repulsion), while "center_nodes" actually places nodes at the center of the graph.
10. **For filtering nodes**: When the user asks to filter nodes (e.g., "場所で絞り込み", "特定の日付のノード", "片野湘雲を中心に場所で絞り込み"), you can add a "filter" field to the Layout Instruction with nested conditions:
\`\`\`json
{
  "layout_strategy": "force_simulation",
  "forces": {
    "center_nodes": { "targetNodeIds": ["片野湘雲"] }
  },
  "filter": {
    "centerNodeIds": ["片野湘雲"],
    "maxHops": 2,
    "condition": {
      "type": "group",
      "logic": "AND",
      "conditions": [
        {
          "type": "condition",
          "field": "label",
          "operator": "in",
          "value": ["Place", "Museum", "Studio", "Location"]
        },
        {
          "type": "condition",
          "field": "mentionedAt",
          "operator": "date_equals",
          "value": "2024-01-15"
        }
      ]
    },
    "includeNeighbors": true
  }
}
\`\`\`
- "condition" can be either a single condition or a group (nested conditions)
- Condition types:
  - "condition": leaf condition with field, operator, and value
  - "group": nested group with logic ("AND" or "OR") and conditions array
- "field" can be "label", "name", or a property key (e.g., "mentionedAt", "場所")
- "operator" can be:
  - "equals": exact match
  - "in": value is in the array
  - "contains": partial match (for strings)
  - "date_equals": date matches exactly (ignores time)
  - "date_after": date is on or after the specified date
  - "date_before": date is on or before the specified date
  - "date_range": date is within the range (value: { "from": "2024-01-01", "to": "2024-12-31" })
- "value" type depends on operator:
  - "equals", "contains", "date_equals", "date_after", "date_before": string
  - "in": array of strings
  - "date_range": object with "from" and "to" strings
- Groups can be nested to express complex logic like "A and (B or C)":
\`\`\`json
{
  "type": "group",
  "logic": "AND",
  "conditions": [
    { "type": "condition", "field": "label", "operator": "equals", "value": "A" },
    {
      "type": "group",
      "logic": "OR",
      "conditions": [
        { "type": "condition", "field": "label", "operator": "equals", "value": "B" },
        { "type": "condition", "field": "label", "operator": "equals", "value": "C" }
      ]
    }
  ]
}
\`\`\`
- Generate related concepts for "in" operator (e.g., for "場所", include "Place", "Museum", "Studio", "Location", etc.)
- When filtering by category like "場所", use "label" field with "in" operator and include related label values
`;

      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ]);

      const responseText = response.content as string;

      // JSONブロックを抽出
      let layoutInstruction: LayoutInstruction | null = null;
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch?.[1]) {
        try {
          const newLayoutInstruction = JSON.parse(
            jsonMatch[1],
          ) as LayoutInstruction;

          // 既存のレイアウト指示とマージ（深いマージ）
          if (currentLayoutInstruction) {
            layoutInstruction = {
              ...currentLayoutInstruction,
              ...newLayoutInstruction,
              forces: {
                ...currentLayoutInstruction.forces,
                ...newLayoutInstruction.forces,
                // 各force設定も個別にマージ
                x_axis: newLayoutInstruction.forces?.x_axis
                  ? {
                      ...currentLayoutInstruction.forces?.x_axis,
                      ...newLayoutInstruction.forces.x_axis,
                    }
                  : currentLayoutInstruction.forces?.x_axis,
                y_axis: newLayoutInstruction.forces?.y_axis
                  ? {
                      ...currentLayoutInstruction.forces?.y_axis,
                      ...newLayoutInstruction.forces.y_axis,
                    }
                  : currentLayoutInstruction.forces?.y_axis,
                charge: newLayoutInstruction.forces?.charge
                  ? {
                      ...currentLayoutInstruction.forces?.charge,
                      ...newLayoutInstruction.forces.charge,
                    }
                  : currentLayoutInstruction.forces?.charge,
                focus_nodes: newLayoutInstruction.forces?.focus_nodes
                  ? newLayoutInstruction.forces.focus_nodes
                  : currentLayoutInstruction.forces?.focus_nodes,
                highlight_nodes: newLayoutInstruction.forces?.highlight_nodes
                  ? newLayoutInstruction.forces.highlight_nodes
                  : currentLayoutInstruction.forces?.highlight_nodes,
                center_nodes: newLayoutInstruction.forces?.center_nodes
                  ? newLayoutInstruction.forces.center_nodes
                  : currentLayoutInstruction.forces?.center_nodes,
              },
              filter: newLayoutInstruction.filter
                ? {
                    ...currentLayoutInstruction.filter,
                    ...newLayoutInstruction.filter,
                    // conditionもマージ（新しいものを優先）
                    condition: newLayoutInstruction.filter.condition
                      ? newLayoutInstruction.filter.condition
                      : currentLayoutInstruction.filter?.condition,
                  }
                : currentLayoutInstruction.filter,
            };
          } else {
            layoutInstruction = newLayoutInstruction;
          }

          // ノード名からIDを解決する処理（focus_nodes用）
          if (
            layoutInstruction?.forces?.focus_nodes?.targetNodeIds &&
            currentGraphData?.nodes
          ) {
            const resolvedNodeIds =
              layoutInstruction.forces.focus_nodes.targetNodeIds.map(
                (nodeIdOrName) => {
                  // 既にID形式（短いID形式）の場合はそのまま使用
                  if (nodeIdOrName.match(/^[a-z0-9]{20,}$/i)) {
                    const existingNode = currentGraphData.nodes.find(
                      (n) => n.id === nodeIdOrName,
                    );
                    if (existingNode) return nodeIdOrName;
                  }
                  // ノード名として検索（部分一致、類似度マッチング）
                  const matchedNode = findNodeByName(
                    nodeIdOrName,
                    currentGraphData.nodes,
                  );
                  return matchedNode?.id ?? nodeIdOrName;
                },
              );
            layoutInstruction.forces.focus_nodes.targetNodeIds =
              resolvedNodeIds;
          }

          // ノード名からIDを解決する処理（center_nodes用）
          if (
            layoutInstruction?.forces?.center_nodes?.targetNodeIds &&
            currentGraphData?.nodes
          ) {
            const resolvedNodeIds =
              layoutInstruction.forces.center_nodes.targetNodeIds.map(
                (nodeIdOrName) => {
                  // 既にID形式（短いID形式）の場合はそのまま使用
                  if (nodeIdOrName.match(/^[a-z0-9]{20,}$/i)) {
                    const existingNode = currentGraphData.nodes.find(
                      (n) => n.id === nodeIdOrName,
                    );
                    if (existingNode) return nodeIdOrName;
                  }
                  // ノード名として検索（部分一致、類似度マッチング）
                  const matchedNode = findNodeByName(
                    nodeIdOrName,
                    currentGraphData.nodes,
                  );
                  return matchedNode?.id ?? nodeIdOrName;
                },
              );
            layoutInstruction.forces.center_nodes.targetNodeIds =
              resolvedNodeIds;
          }

          // ノード名からIDを解決する処理（highlight_nodes用）
          if (
            layoutInstruction?.forces?.highlight_nodes?.targetNodeIds &&
            currentGraphData?.nodes
          ) {
            const resolvedNodeIds =
              layoutInstruction.forces.highlight_nodes.targetNodeIds.map(
                (nodeIdOrName) => {
                  // 既にID形式（短いID形式）の場合はそのまま使用
                  if (nodeIdOrName.match(/^[a-z0-9]{20,}$/i)) {
                    const existingNode = currentGraphData.nodes.find(
                      (n) => n.id === nodeIdOrName,
                    );
                    if (existingNode) return nodeIdOrName;
                  }
                  // ノード名として検索（部分一致、類似度マッチング）
                  const matchedNode = findNodeByName(
                    nodeIdOrName,
                    currentGraphData.nodes,
                  );
                  return matchedNode?.id ?? nodeIdOrName;
                },
              );
            layoutInstruction.forces.highlight_nodes.targetNodeIds =
              resolvedNodeIds;
          }

          // filter.centerNodeIdsのノード名解決
          if (
            layoutInstruction?.filter?.centerNodeIds &&
            currentGraphData?.nodes
          ) {
            const resolvedNodeIds = layoutInstruction.filter.centerNodeIds.map(
              (nodeIdOrName) => {
                // 既にID形式（短いID形式）の場合はそのまま使用
                if (nodeIdOrName.match(/^[a-z0-9]{20,}$/i)) {
                  const existingNode = currentGraphData.nodes.find(
                    (n) => n.id === nodeIdOrName,
                  );
                  if (existingNode) return nodeIdOrName;
                }
                // ノード名として検索（部分一致、類似度マッチング）
                const matchedNode = findNodeByName(
                  nodeIdOrName,
                  currentGraphData.nodes,
                );
                return matchedNode?.id ?? nodeIdOrName;
              },
            );
            layoutInstruction.filter.centerNodeIds = resolvedNodeIds;
          }
        } catch (e) {
          console.error("Failed to parse layout instruction JSON", e);
        }
      }

      const replyText = responseText.replace(/```json[\s\S]*?```/, "").trim();

      // フィルタリング済みグラフを生成
      let filteredGraphData: GraphDocumentForFrontend | undefined = undefined;
      if (layoutInstruction?.filter && currentGraphData) {
        try {
          // GraphDocumentFrontendSchemaの型とGraphDocumentForFrontendの型が
          // propertiesの型で異なるが、実際のデータは互換性があるため型アサーションを使用
          // propertiesは実行時に文字列として扱われるため、型の不一致は問題ない
          filteredGraphData = filterGraphByLayoutInstruction(
            currentGraphData as GraphDocumentForFrontend,
            layoutInstruction.filter,
          );
        } catch (e) {
          console.error("Failed to filter graph", e);
          // エラーが発生した場合はフィルタリングをスキップ
        }
      }

      return {
        reply: replyText,
        rawResponse: responseText,
        layoutInstruction,
        filteredGraphData,
      };
    }),

  analyzeGraphInsights: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        currentGraphData: GraphDocumentFrontendSchema.optional(),
        curatorialContext: CuratorialContextSchema.optional().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      const { currentGraphData, curatorialContext } = input;

      if (!currentGraphData?.nodes || currentGraphData.nodes.length === 0) {
        return {
          insights: {
            summary: "グラフデータが提供されていません。",
            centralConcepts: {
              nodes: [],
              summary: "",
            },
            filteringOptions: [],
            clusteringSuggestions: [],
            axisSuggestions: {
              x_axis: [],
              y_axis: [],
            },
            layoutSuggestions: [],
          },
        };
      }

      // グラフ構造分析を実行
      const analysis = analyzeGraphStructure(
        currentGraphData as GraphDocumentForFrontend,
      );

      // LLMに渡すための構造化データを準備
      const analysisData = prepareAnalysisForLLM(analysis);

      const llm = new ChatOpenAI({
        temperature: 0.3,
        model: "gpt-4o-mini",
      });

      const stance = curatorialContext?.stance
        ? `Stance: ${curatorialContext.stance}`
        : "Stance: Neutral/Undefined";

      const systemPrompt = `You are "ArsTraverse Insight Analyzer", an AI assistant specialized in analyzing knowledge graphs and providing insights for visualization.

[Curatorial Context]
${stance}

[Task]
Analyze the provided graph structure and generate a comprehensive summary in Japanese that explains:
1. What this graph represents (main themes, domains)
2. Key characteristics (central nodes, relationship patterns)
3. Notable patterns or structures
4. Suggestions for visualization approaches

The summary should be conversational, easy to understand, and helpful for users who want to understand their knowledge graph.

[Graph Analysis Data]
${analysisData}

[Output Format]
You MUST output a valid JSON object with this structure:
{
  "summary": "A comprehensive summary in Japanese explaining the graph's characteristics, main themes, and notable patterns. This should be 3-5 sentences, conversational and easy to understand.",
  "centralConcepts": {
    "nodes": [
      {
        "id": "node_id",
        "name": "node_name",
        "label": "node_label",
        "centralityScore": 0.85,
        "degree": 15,
        "reason": "Why this node is central (in Japanese)"
      }
    ],
    "summary": "Overall explanation of why these nodes are central (in Japanese)"
  },
  "filteringOptions": [
    {
      "type": "by_label",
      "description": "Filter by node label",
      "suggestedValues": ["Person", "Event"],
      "reasoning": "Why this filtering is useful (in Japanese)"
    }
  ],
  "clusteringSuggestions": [
    {
      "method": "by_label",
      "description": "Cluster by node label",
      "expectedClusters": 5,
      "reasoning": "Why this clustering makes sense (in Japanese)"
    }
  ],
  "axisSuggestions": {
    "x_axis": [
      {
        "attribute": "date",
        "type": "timeline",
        "reasoning": "This attribute represents time progression (in Japanese)",
        "groups": null
      }
    ],
    "y_axis": [
      {
        "attribute": "category",
        "type": "category_separation",
        "reasoning": "This attribute can separate nodes into groups (in Japanese)",
        "groups": {"group1": "top", "group2": "bottom"}
      }
    ]
  },
  "layoutSuggestions": [
    {
      "name": "Timeline Layout",
      "description": "Arrange nodes by date on X-axis",
      "layoutInstruction": {
        "layout_strategy": "force_simulation",
        "forces": {
          "x_axis": {
            "type": "timeline",
            "attribute": "date",
            "strength": 0.8
          }
        }
      },
      "reasoning": "This layout reveals temporal relationships (in Japanese)"
    }
  ]
}

[Important Guidelines]
- All text should be in Japanese
- Be specific and actionable in your suggestions
- For layout suggestions, provide complete LayoutInstruction objects that can be directly used
- Explain the reasoning behind each insight
- Consider the graph structure, node labels, relationship types, and available attributes
- If numeric attributes exist with time-series characteristics, suggest timeline layouts
- If categorical attributes exist, suggest category_separation layouts
- Consider centrality scores when identifying central concepts`;

      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "このグラフの特徴を分析して、わかりやすい説明を生成してください。",
        },
      ]);

      const responseText = response.content as string;

      // JSONを抽出
      let jsonText = responseText.trim();
      if (jsonText.includes("```json")) {
        jsonText =
          jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
      } else if (jsonText.includes("```")) {
        jsonText =
          jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
      }

      try {
        const insights = JSON.parse(jsonText) as {
          summary: string;
          centralConcepts: {
            nodes: Array<{
              id: string;
              name: string;
              label: string;
              centralityScore: number;
              degree: number;
              reason: string;
            }>;
            summary: string;
          };
          filteringOptions: Array<{
            type: string;
            description: string;
            suggestedValues: string[];
            reasoning: string;
          }>;
          clusteringSuggestions: Array<{
            method: string;
            description: string;
            expectedClusters: number;
            reasoning: string;
          }>;
          axisSuggestions: {
            x_axis: Array<{
              attribute: string;
              type: string;
              reasoning: string;
              groups?: Record<string, string | number> | null;
            }>;
            y_axis: Array<{
              attribute: string;
              type: string;
              reasoning: string;
              groups?: Record<string, string | number> | null;
            }>;
          };
          layoutSuggestions: Array<{
            name: string;
            description: string;
            layoutInstruction: LayoutInstruction;
            reasoning: string;
          }>;
        };

        return {
          insights: {
            summary: insights.summary,
            centralConcepts: insights.centralConcepts,
            filteringOptions: insights.filteringOptions ?? [],
            clusteringSuggestions: insights.clusteringSuggestions ?? [],
            axisSuggestions: insights.axisSuggestions ?? {
              x_axis: [],
              y_axis: [],
            },
            layoutSuggestions: insights.layoutSuggestions ?? [],
          },
        };
      } catch (error) {
        console.error("Failed to parse insights JSON", error);
        // フォールバック: シンプルなサマリーを返す
        return {
          insights: {
            summary: `このグラフには${analysis.structure.nodeCount}個のノードと${analysis.structure.relationshipCount}個のリレーションがあります。グラフの詳細な分析を生成できませんでしたが、基本的な統計情報は利用可能です。`,
            centralConcepts: {
              nodes: analysis.structure.topDegreeNodes.slice(0, 5).map((n) => ({
                id: n.id,
                name: n.name,
                label: n.label,
                centralityScore: n.degree / analysis.structure.nodeCount,
                degree: n.degree,
                reason: `このノードは${n.degree}個のリレーションを持っており、グラフの中心的な役割を果たしています。`,
              })),
              summary: "次数が高いノードがグラフの中心的な概念を表しています。",
            },
            filteringOptions: [],
            clusteringSuggestions: [],
            axisSuggestions: {
              x_axis: [],
              y_axis: [],
            },
            layoutSuggestions: [],
          },
        };
      }
    }),

  summarizeCommunities: protectedProcedure
    .input(
      z.object({
        communities: z.array(
          z.object({
            communityId: z.string(),
            memberNodeNames: z.array(z.string()),
            memberNodeLabels: z.array(z.string()).optional(),
            internalEdges: z.string().optional(), // コミュニティ内のエッジ情報
            externalConnections: z.string().optional(), // 他のコミュニティへの接続情報
          }),
        ),
        curatorialContext: CuratorialContextSchema.optional().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      const { communities, curatorialContext } = input;

      if (communities.length === 0) {
        return {
          summaries: [],
          narrativeFlow: [],
        };
      }

      const llm = new ChatOpenAI({
        temperature: 0.3,
        model: "gpt-4o-mini",
      });

      const stance = curatorialContext?.stance
        ? `Stance: ${curatorialContext.stance}`
        : "Stance: Neutral/Undefined";

      const systemPrompt = `You are "ArsTraverse Story Generator", an AI assistant specialized in analyzing knowledge graph communities and generating narrative summaries for art and cultural contexts.

[Curatorial Context]
${stance}

[Task]
Given a set of communities (groups of related nodes) from a knowledge graph, generate:
1. A meaningful Title (e.g., "Impressionism", "19th Century French Art") for each community
2. A concise Summary (1-2 sentences) explaining what this community represents
3. A Narrative Flow - an ordered sequence of community IDs that tells a coherent story

[Important]
- Pay attention to the internal edges (relationships within the community) to understand the connections between nodes
- Consider external connections (relationships to other communities) when creating the narrative flow
- Use edge types and connection patterns to generate more contextually accurate summaries

[Output Format]
You MUST output a valid JSON object with this structure:
{
  "summaries": [
    {
      "communityId": "community_id",
      "title": "Meaningful Title in Japanese",
      "summary": "1-2 sentence explanation in Japanese"
    }
  ],
  "narrativeFlow": [
    {
      "communityId": "community_id",
      "order": 1,
      "transitionText": "Explanation of how this connects to the previous community (in Japanese)"
    }
  ]
}

[Narrative Flow Creation Strategy]
1. DO NOT simply order by community ID - analyze the external connections data
2. Start with communities that have NO external connections (entry points) OR communities with the MOST external connections (central hubs)
3. Follow external connection edges to create a logical flow from one community to the next
4. Use edge types and connection counts to determine importance and flow direction
5. Create a story that flows naturally based on actual graph connections
6. The order should tell a coherent narrative, not just list communities
7. **IMPORTANT**: Select at most 10 communities for the narrative flow. If there are more than 10 communities, choose the most important ones that create the best coherent story based on external connections and thematic relevance

[External Connections Analysis]
For each community, analyze:
- Which communities it connects TO (outgoing connections)
- Which communities connect TO it (incoming connections)
- The strength of connections (edge count)
- The types of relationships (edge types)
Use this data to create a meaningful narrative progression that follows the graph structure.

[Guidelines]
- All text should be in Japanese
- Titles should be concise (3-10 words) and meaningful
- Summaries should explain the theme or concept represented by the community (not just "〇〇のコミュニティです")
- Summaries should hint at the story within the community - what relationships, events, or themes connect the nodes
- Narrative Flow should create a logical progression through the communities based on external connections
- Transition texts should explain relationships between communities using the connection data
- Consider the curatorial context when generating titles and summaries`;

      const communitiesText = communities
        .map(
          (c, idx) => `
Community ${idx + 1} (ID: ${c.communityId}):
- Members: ${c.memberNodeNames.slice(0, 20).join(", ")}${c.memberNodeNames.length > 20 ? "..." : ""}
- Labels: ${c.memberNodeLabels?.slice(0, 10).join(", ") ?? "N/A"}
- Internal Relationships (within community): ${c.internalEdges ?? "None"}
- External Connections (to other communities): ${c.externalConnections ?? "None (isolated community)"}
`,
        )
        .join("\n");

      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `以下のコミュニティを分析して、タイトル、要約、ナラティブフローを生成してください:\n\n${communitiesText}`,
        },
      ]);

      const responseText = response.content as string;

      // JSONを抽出
      let jsonText = responseText.trim();
      if (jsonText.includes("```json")) {
        jsonText =
          jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
      } else if (jsonText.includes("```")) {
        jsonText =
          jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
      }

      try {
        const result = JSON.parse(jsonText) as {
          summaries: Array<{
            communityId: string;
            title: string;
            summary: string;
          }>;
          narrativeFlow: Array<{
            communityId: string;
            order: number;
            transitionText: string;
          }>;
        };

        // コミュニティIDの存在確認
        const validSummaries = result.summaries.filter((s) =>
          communities.some((c) => c.communityId === s.communityId),
        );

        // ナラティブフローを順序でソート
        const sortedFlow = result.narrativeFlow
          .filter((n) =>
            communities.some((c) => c.communityId === n.communityId),
          )
          .sort((a, b) => a.order - b.order)
          .slice(0, 10); // 最大10個までに制限

        // ストーリーに選ばれなかったコミュニティのタイトルを生成
        const narrativeFlowCommunityIds = new Set(
          sortedFlow.map((f) => f.communityId),
        );
        const missingTitleCommunities = communities.filter(
          (c) => !narrativeFlowCommunityIds.has(c.communityId),
        );

        // ストーリーに選ばれなかったコミュニティのタイトルのみを生成
        let additionalSummaries: Array<{
          communityId: string;
          title: string;
          summary: string;
        }> = [];

        if (missingTitleCommunities.length > 0) {
          console.log(
            `Missing titles for ${missingTitleCommunities.length} communities, generating titles...`,
          );
          try {
            const titleGenerationPrompt = `以下のコミュニティに対して、それぞれ意味のある日本語のタイトルを生成してください。各コミュニティのメンバーや関係性を分析して、適切なタイトルを付けてください。

${missingTitleCommunities
  .map(
    (c, idx) => `
Community ${idx + 1} (ID: ${c.communityId}):
- Members: ${c.memberNodeNames.slice(0, 20).join(", ")}${c.memberNodeNames.length > 20 ? "..." : ""}
- Labels: ${c.memberNodeLabels?.slice(0, 10).join(", ") ?? "N/A"}
- Internal Relationships: ${c.internalEdges ?? "None"}
`,
  )
  .join("\n")}

出力形式（JSON）:
{
  "titles": [
    { "communityId": "community_id", "title": "Meaningful Title in Japanese" }
  ]
}`;

            const titleResponse = await llm.invoke([
              {
                role: "system",
                content:
                  "You are a helpful assistant that generates meaningful titles for knowledge graph communities in Japanese.",
              },
              { role: "user", content: titleGenerationPrompt },
            ]);

            const titleResponseText = titleResponse.content as string;
            let titleJsonText = titleResponseText.trim();
            if (titleJsonText.includes("```json")) {
              titleJsonText =
                titleJsonText.split("```json")[1]?.split("```")[0]?.trim() ??
                titleJsonText;
            } else if (titleJsonText.includes("```")) {
              titleJsonText =
                titleJsonText.split("```")[1]?.split("```")[0]?.trim() ??
                titleJsonText;
            }

            const titleResult = JSON.parse(titleJsonText) as {
              titles: Array<{ communityId: string; title: string }>;
            };

            additionalSummaries = missingTitleCommunities.map((c) => {
              const generatedTitle = titleResult.titles.find(
                (t) => t.communityId === c.communityId,
              );
              return {
                communityId: c.communityId,
                title: generatedTitle?.title ?? `コミュニティ ${c.communityId}`,
                summary: "",
              };
            });
          } catch (titleError) {
            console.error("Failed to generate missing titles:", titleError);
            // フォールバック: デフォルトタイトルを使用
            additionalSummaries = missingTitleCommunities.map((c) => ({
              communityId: c.communityId,
              title: `コミュニティ ${c.communityId}`,
              summary: "",
            }));
          }
        }

        // 全てのコミュニティのタイトルを含むsummariesを作成
        const allSummaries = [...validSummaries, ...additionalSummaries];

        return {
          summaries: allSummaries,
          narrativeFlow: sortedFlow,
        };
      } catch (error) {
        console.error("Failed to parse community summaries JSON", error);
        // フォールバック: コミュニティIDをそのまま使用
        return {
          summaries: communities.map((c) => ({
            communityId: c.communityId,
            title: `コミュニティ ${c.communityId}`,
            summary: `${c.memberNodeNames.length}個のノードを含むコミュニティです。`,
          })),
          narrativeFlow: communities
            .slice(0, 10) // 最大10個までに制限
            .map((c, idx) => ({
              communityId: c.communityId,
              order: idx + 1,
              transitionText: `次のコミュニティへ移ります。`,
            })),
        };
      }
    }),

  generateMetaGraph: protectedProcedure
    .input(
      z.object({
        graphDocument: GraphDocumentFrontendSchema,
        minCommunitySize: z.number().optional().default(3),
      }),
    )
    .mutation(async ({ input }) => {
      const { graphDocument, minCommunitySize } = input;

      if (!graphDocument?.nodes?.length) {
        return {
          metaNodes: [],
          metaGraph: { nodes: [], relationships: [] },
          communityMap: {},
          preparedCommunities: [],
        };
      }

      try {
        // Graphologyグラフを作成
        const graph = new Graph();

        // ノードを追加
        graphDocument.nodes.forEach((node) => {
          graph.addNode(node.id, {
            name: node.name,
            label: node.label,
            properties: node.properties,
          });
        });

        // エッジを追加（無向グラフとして）
        graphDocument.relationships.forEach((rel) => {
          if (!graph.hasEdge(rel.sourceId, rel.targetId)) {
            graph.addEdge(rel.sourceId, rel.targetId, {
              type: rel.type,
              properties: rel.properties,
              weight: 1,
            });
          }
        });

        // Louvainアルゴリズムでコミュニティ検出
        const communities = louvain(graph);

        // コミュニティIDごとにノードをグループ化
        const communityGroups = new Map<string, string[]>();
        const communityMap: Record<string, string> = {};

        graphDocument.nodes.forEach((node) => {
          const communityId = communities[node.id] ?? "unassigned";
          const commIdStr = communityId.toString();
          if (!communityGroups.has(commIdStr)) {
            communityGroups.set(commIdStr, []);
          }
          communityGroups.get(commIdStr)!.push(node.id);
          communityMap[node.id] = commIdStr;
        });

        // コミュニティごとの内部エッジと外部接続を計算
        const communityInternalEdges = new Map<
          string,
          Array<{ sourceName: string; targetName: string; type: string }>
        >();
        const communityExternalConnections = new Map<
          string,
          Map<string, { count: number; types: Set<string> }>
        >();

        // 各コミュニティのエッジを分類
        graphDocument.relationships.forEach((rel) => {
          const sourceCommunity = communities[rel.sourceId] ?? "unassigned";
          const targetCommunity = communities[rel.targetId] ?? "unassigned";
          const sourceNode = graphDocument.nodes.find(
            (n) => n.id === rel.sourceId,
          );
          const targetNode = graphDocument.nodes.find(
            (n) => n.id === rel.targetId,
          );

          if (!sourceNode || !targetNode) return;

          if (sourceCommunity === targetCommunity) {
            // 内部エッジ
            const commIdStr = sourceCommunity.toString();
            if (!communityInternalEdges.has(commIdStr)) {
              communityInternalEdges.set(commIdStr, []);
            }
            communityInternalEdges.get(commIdStr)!.push({
              sourceName: sourceNode.name,
              targetName: targetNode.name,
              type: rel.type,
            });
          } else {
            // 外部エッジ
            const commId = sourceCommunity.toString();
            const targetCommId = targetCommunity.toString();

            if (!communityExternalConnections.has(commId)) {
              communityExternalConnections.set(commId, new Map());
            }
            const connections = communityExternalConnections.get(commId)!;

            if (!connections.has(targetCommId)) {
              connections.set(targetCommId, { count: 0, types: new Set() });
            }
            const conn = connections.get(targetCommId)!;
            conn.count += 1;
            conn.types.add(rel.type);
          }
        });

        // メタノードを作成
        const allMetaNodes = Array.from(communityGroups.entries()).map(
          ([communityId, memberNodeIds]) => {
            const memberNodes = memberNodeIds
              .map((id) => graphDocument.nodes.find((n) => n.id === id))
              .filter((n) => n !== undefined);

            const internalEdges =
              communityInternalEdges.get(communityId)?.slice(0, 20) ?? [];
            const externalConnMap =
              communityExternalConnections.get(communityId);
            const externalConnections = externalConnMap
              ? Array.from(externalConnMap.entries()).map(
                  ([targetCommId, data]) => ({
                    targetCommunityId: targetCommId,
                    edgeCount: data.count,
                    edgeTypes: Array.from(data.types),
                  }),
                )
              : [];

            return {
              communityId,
              memberNodeIds,
              memberNodeNames: memberNodes.map((n) => n.name),
              size: memberNodeIds.length,
              internalEdges,
              externalConnections,
              hasExternalConnections: externalConnections.length > 0,
            };
          },
        );

        // フィルタリング：独立した小さなコミュニティを除外
        const filteredMetaNodes = allMetaNodes.filter((metaNode) => {
          if (metaNode.hasExternalConnections) return true;
          return metaNode.size > minCommunitySize;
        });

        // メタエッジを作成（コミュニティ間のエッジを集約）
        const metaEdgesMap = new Map<
          string,
          { count: number; types: Set<string> }
        >();

        graphDocument.relationships.forEach((rel) => {
          const sourceCommunity = communities[rel.sourceId] ?? "unassigned";
          const targetCommunity = communities[rel.targetId] ?? "unassigned";

          if (sourceCommunity !== targetCommunity) {
            const edgeKey = `${sourceCommunity}-${targetCommunity}`;
            const reverseKey = `${targetCommunity}-${sourceCommunity}`;
            const key = edgeKey < reverseKey ? edgeKey : reverseKey;
            const existing = metaEdgesMap.get(key);

            if (existing) {
              existing.count += 1;
              existing.types.add(rel.type);
            } else {
              metaEdgesMap.set(key, {
                count: 1,
                types: new Set([rel.type]),
              });
            }
          }
        });

        // メタグラフのノード（コミュニティ）を作成
        const metaGraphNodes = filteredMetaNodes.map((metaNode) => ({
          id: metaNode.communityId,
          name: `Community ${metaNode.communityId}`,
          label: "Community",
          properties: {
            size: String(metaNode.size),
            memberCount: String(metaNode.size),
            memberNames: metaNode.memberNodeNames.slice(0, 10).join(", "),
          },
          topicSpaceId: undefined,
          documentGraphId: undefined,
          neighborLinkCount: metaNode.externalConnections.length,
          visible: true,
        }));

        // メタグラフのエッジを作成
        const metaGraphRelationships = Array.from(metaEdgesMap.entries()).map(
          ([edgeKey, edgeData], index) => {
            const [sourceCommunity, targetCommunity] = edgeKey.split("-");
            return {
              id: `meta-edge-${index}`,
              type: Array.from(edgeData.types).join(", "),
              properties: {
                weight: String(edgeData.count),
                edgeCount: String(edgeData.count),
              },
              sourceId: sourceCommunity ?? "",
              targetId: targetCommunity ?? "",
              topicSpaceId: undefined,
              documentGraphId: undefined,
            };
          },
        );

        const metaGraph: GraphDocumentForFrontend = {
          nodes: metaGraphNodes,
          relationships: metaGraphRelationships,
        };

        // LLMに送る形式で前処理済みコミュニティデータを作成
        const preparedCommunities = filteredMetaNodes.map((metaNode) => {
          const memberNodes = metaNode.memberNodeIds
            .map((id) => graphDocument.nodes.find((n) => n.id === id))
            .filter((n) => n !== undefined);
          const labels = memberNodes.map((n) => n.label);

          // 全内部エッジ情報（制限なし、構造化）
          const allInternalEdges = metaNode.internalEdges.map((edge) => {
            // 元のrelationshipからプロパティ情報を取得
            const sourceRel = graphDocument.relationships.find(
              (r) =>
                r.sourceId === edge.sourceName &&
                r.targetId === edge.targetName &&
                r.type === edge.type,
            );
            // ノードIDからrelationshipを検索（より正確）
            const sourceNode = graphDocument.nodes.find(
              (n) => n.name === edge.sourceName,
            );
            const targetNode = graphDocument.nodes.find(
              (n) => n.name === edge.targetName,
            );
            const rel =
              sourceNode && targetNode
                ? graphDocument.relationships.find(
                    (r) =>
                      r.sourceId === sourceNode.id &&
                      r.targetId === targetNode.id &&
                      r.type === edge.type,
                  )
                : sourceRel;

            return {
              sourceId: sourceNode?.id ?? "",
              sourceName: edge.sourceName,
              targetId: targetNode?.id ?? "",
              targetName: edge.targetName,
              type: edge.type,
              properties: rel?.properties ?? {},
            };
          });

          // 外部接続の情報を文字列化（要約用）
          const externalConnectionsText = metaNode.externalConnections
            .map(
              (conn) =>
                `Community ${conn.targetCommunityId} (${conn.edgeCount} edges: ${conn.edgeTypes.join(", ")})`,
            )
            .join(", ");

          // summarizeCommunities用の簡易版（後方互換性のため）
          const internalEdgesText = metaNode.internalEdges
            .slice(0, 10)
            .map((e) => `${e.sourceName} --[${e.type}]--> ${e.targetName}`)
            .join(", ");

          return {
            communityId: metaNode.communityId,
            memberNodeNames: metaNode.memberNodeNames,
            memberNodeLabels: labels,
            // 簡易版（summarizeCommunities用）
            internalEdges: internalEdgesText || undefined,
            externalConnections: externalConnectionsText || undefined,
            // 詳細版（generateCommunityStory用）
            memberNodes: memberNodes.map((n) => ({
              id: n.id,
              name: n.name,
              label: n.label,
              properties: n.properties ?? {},
            })),
            internalEdgesDetailed: allInternalEdges,
          };
        });

        return {
          metaNodes: filteredMetaNodes,
          metaGraph,
          communityMap,
          preparedCommunities,
        };
      } catch (error) {
        console.error("Failed to generate meta graph:", error);
        return {
          metaNodes: [],
          metaGraph: { nodes: [], relationships: [] },
          communityMap: {},
          preparedCommunities: [],
        };
      }
    }),

  generateCommunityStory: protectedProcedure
    .input(
      z.object({
        communityId: z.string(),
        // 後方互換性のため残す
        memberNodeNames: z.array(z.string()).optional(),
        memberNodeLabels: z.array(z.string()).optional(),
        internalEdges: z.string().optional(),
        externalConnections: z.string().optional(),
        // 詳細情報（新規）
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
        curatorialContext: CuratorialContextSchema.optional().nullable(),
        workspaceId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const {
        communityId,
        memberNodeNames,
        memberNodeLabels,
        internalEdges,
        externalConnections,
        memberNodes,
        internalEdgesDetailed,
        curatorialContext,
        workspaceId,
      } = input;

      const llm = new ChatOpenAI({
        temperature: 0.3,
        model: "gpt-4o-mini",
      });

      const wordCount = 200;

      // キーワード抽出関数
      const extractKeywords = (
        nodes: typeof memberNodes,
        edges: typeof internalEdgesDetailed,
      ): string[] => {
        const keywords = new Set<string>();

        // ノード名を追加
        if (nodes) {
          nodes.forEach((node) => {
            if (node.name && node.name.length > 1) {
              keywords.add(node.name);
            }
            // ノードのプロパティから値も抽出
            if (node.properties) {
              Object.values(node.properties).forEach((value) => {
                if (
                  typeof value === "string" &&
                  value.length > 1 &&
                  value.length < 50
                ) {
                  // 日本語の助詞や接続詞を除去
                  const cleaned = value
                    .replace(/[のをにへとがでからよりまで]/g, "")
                    .trim();
                  if (cleaned.length > 1) {
                    keywords.add(cleaned);
                  }
                }
              });
            }
          });
        }

        // エッジタイプを追加
        if (edges) {
          edges.forEach((edge) => {
            if (edge.type && edge.type.length > 1) {
              keywords.add(edge.type);
            }
            // エッジのプロパティから値も抽出
            if (edge.properties) {
              Object.values(edge.properties).forEach((value) => {
                if (
                  typeof value === "string" &&
                  value.length > 1 &&
                  value.length < 50
                ) {
                  const cleaned = value
                    .replace(/[のをにへとがでからよりまで]/g, "")
                    .trim();
                  if (cleaned.length > 1) {
                    keywords.add(cleaned);
                  }
                }
              });
            }
          });
        }

        // 最大20個に制限
        return Array.from(keywords).slice(0, 20);
      };

      // SourceDocumentから関連セクションを取得
      let sourceDocumentSections: string[] = [];
      if (workspaceId) {
        try {
          const workspace = await ctx.db.workspace.findFirst({
            where: {
              id: workspaceId,
              isDeleted: false,
              OR: [
                { userId: ctx.session.user.id },
                { collaborators: { some: { id: ctx.session.user.id } } },
              ],
            },
            include: {
              referencedTopicSpaces: {
                where: { isDeleted: false },
                include: {
                  sourceDocuments: {
                    where: { isDeleted: false },
                  },
                },
              },
            },
          });

          if (workspace && workspace.referencedTopicSpaces.length > 0) {
            // キーワードを抽出
            const keywords = extractKeywords(
              memberNodes,
              internalEdgesDetailed,
            );

            if (keywords.length > 0) {
              // すべてのSourceDocumentを収集
              const allSourceDocuments: Array<{
                id: string;
                topicSpaceName: string;
              }> = [];
              workspace.referencedTopicSpaces.forEach((topicSpace) => {
                topicSpace.sourceDocuments.forEach((doc) => {
                  allSourceDocuments.push({
                    id: doc.id,
                    topicSpaceName: topicSpace.name,
                  });
                });
              });

              // 各SourceDocumentからセクションを取得（並列処理、タイムアウト付き）
              const sectionPromises = allSourceDocuments.map(async (doc) => {
                try {
                  const timeoutPromise = new Promise<string[]>((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")), 10000),
                  );
                  const referencePromise = getTextReference(
                    ctx,
                    doc.id,
                    keywords,
                    300, // contextLength: 300文字（前後150文字）
                  );
                  const sections = await Promise.race([
                    referencePromise,
                    timeoutPromise,
                  ]);
                  return sections.map((section) => ({
                    section,
                    topicSpaceName: doc.topicSpaceName,
                  }));
                } catch (error) {
                  console.warn(
                    `Failed to get text reference for document ${doc.id}:`,
                    error,
                  );
                  return [];
                }
              });

              const allSections = await Promise.all(sectionPromises);
              const flattenedSections = allSections.flat();

              // 重複除去（最初の50文字が同じセクションは重複とみなす）
              const seen = new Set<string>();
              const uniqueSections = flattenedSections.filter((item) => {
                const prefix = item.section.substring(0, 50);
                if (seen.has(prefix)) {
                  return false;
                }
                seen.add(prefix);
                return true;
              });

              // キーワードマッチ数を計算してソート
              const sectionsWithScore = uniqueSections.map((item) => {
                const matchCount = keywords.filter((keyword) =>
                  item.section.includes(keyword),
                ).length;
                return { ...item, matchCount };
              });

              // マッチ数が多い順にソートし、最大8個に制限
              sectionsWithScore.sort((a, b) => b.matchCount - a.matchCount);
              sourceDocumentSections = sectionsWithScore
                .slice(0, 8)
                .map((item) => item.section);
            }
          }
        } catch (error) {
          console.warn(
            `Failed to get source documents for workspace ${workspaceId}:`,
            error,
          );
          // エラーが発生しても処理を継続
        }
      }

      const stance = curatorialContext?.stance
        ? `Stance: ${curatorialContext.stance}`
        : "Stance: Neutral/Undefined";

      const systemPrompt = `You are "ArsTraverse Story Writer", an AI assistant specialized in writing rich, narrative stories about knowledge graph communities in art and cultural contexts.

[Curatorial Context]
${stance}

[Task]
Generate a rich, detailed narrative story (3-5 paragraphs, 200-400 words) about this community that:
1. Describes WHO the key figures are and WHAT they did (use node properties for additional context)
2. Explains HOW they are connected (use ALL internal edge information, including edge properties)
3. Tells a STORY with context, not just facts
4. Uses chronological or thematic progression
5. Connects individual actions to broader themes
6. Avoids generic descriptions like "〇〇のコミュニティです"
7. Incorporates specific details from node and edge properties when available
8. Shows the richness of relationships within the community
9. When source document references are provided, use them to add depth and context to the story

[Writing Style]
- Write in User's language
- Use narrative style, not just listing facts
- Include specific relationships and connections
- Show cause and effect, not just description
- Create a sense of story progression
- Make it engaging and informative
- When source document references are available, incorporate relevant details naturally into the narrative

[Word Count]
- The story should be ${wordCount} words long (±50 words tolerance).
- Strictly adhere to this word count range. Do not exceed ${wordCount + 50} words or go below ${wordCount - 50} words.

[Example]
Instead of: "片野湘雲に関連するコミュニティです。"
Write: "片野湘雲は上溝村で生まれ、父・片野儀右衛門から絵の手ほどきを受けました。儀右衛門は十二天神社に大絵馬を奉納し、後に愛松斎儀亭と名乗るなど、地域の文化人として活動しました。湘雲は元湯玉川館や荒木十畝と交流を持ち、後に画塾を設立して多くの弟子を育てました。これは相模原地域における日本画の伝統と、師弟関係を通じた文化継承の物語を語っています。"`;

      // 詳細情報がある場合はそれを使用、なければ簡易版を使用
      const hasDetailedInfo = memberNodes && internalEdgesDetailed;

      const communityInfo = hasDetailedInfo
        ? `
Community ID: ${communityId}

[Members (${memberNodes.length} nodes)]
${memberNodes
  .map(
    (node, idx) =>
      `${idx + 1}. ${node.name} (${node.label})${
        node.properties && Object.keys(node.properties).length > 0
          ? `\n   Properties: ${JSON.stringify(node.properties, null, 2)}`
          : ""
      }`,
  )
  .join("\n")}

[Internal Relationships (${internalEdgesDetailed.length} edges)]
${internalEdgesDetailed
  .map(
    (edge, idx) =>
      `${idx + 1}. ${edge.sourceName} --[${edge.type}]--> ${edge.targetName}${
        edge.properties && Object.keys(edge.properties).length > 0
          ? `\n   Properties: ${JSON.stringify(edge.properties, null, 2)}`
          : ""
      }`,
  )
  .join("\n")}

[External Connections]
${externalConnections ?? "None (isolated community)"}
`
        : `
Community ID: ${communityId}
- Members: ${memberNodeNames?.slice(0, 30).join(", ") ?? "N/A"}${(memberNodeNames?.length ?? 0) > 30 ? "..." : ""}
- Labels: ${memberNodeLabels?.slice(0, 15).join(", ") ?? "N/A"}
- Internal Relationships: ${internalEdges ?? "None"}
- External Connections: ${externalConnections ?? "None (isolated community)"}
`;

      // ユーザープロンプトを構築
      let userPrompt = `以下のコミュニティについて、詳細なストーリーを${wordCount}字程度で生成してください:\n\n${communityInfo}`;

      // SourceDocumentのセクションがある場合は追加
      if (sourceDocumentSections.length > 0) {
        userPrompt += `\n\n[Source Document References]\n以下の情報源から取得した関連セクションを参照して、より詳細で豊富なストーリーを生成してください:\n\n${sourceDocumentSections
          .map((section, idx) => `--- Reference ${idx + 1} ---\n${section}`)
          .join("\n\n")}`;
      }

      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userPrompt,
        },
      ]);

      return {
        communityId,
        story: response.content as string,
      };
    }),

  regenerateNarrativeFlow: protectedProcedure
    .input(
      z.object({
        orderedCommunityIds: z.array(z.string()),
        communities: z.array(PreparedCommunitySchema),
        curatorialContext: CuratorialContextSchema.optional().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      const { orderedCommunityIds, communities, curatorialContext } = input;

      if (orderedCommunityIds.length === 0) {
        return {
          narrativeFlow: [],
        };
      }

      // 順序に従ってコミュニティを並べ替え
      const orderedCommunities = orderedCommunityIds
        .map((id) => communities.find((c) => c.communityId === id))
        .filter(
          (c): c is z.infer<typeof PreparedCommunitySchema> => c !== undefined,
        );

      if (orderedCommunities.length === 0) {
        return {
          narrativeFlow: [],
        };
      }

      const llm = new ChatOpenAI({
        temperature: 0.3,
        model: "gpt-4o-mini",
      });

      const stance = curatorialContext?.stance
        ? `Stance: ${curatorialContext.stance}`
        : "Stance: Neutral/Undefined";

      const systemPrompt = `You are "ArsTraverse Story Weaver", an AI assistant specialized in creating coherent narrative flows between knowledge graph communities.

[Curatorial Context]
${stance}

[Task]
Given an ORDERED sequence of communities, generate "Transition Text" that logically connects each community to the next one in the sequence.
The transition text should bridge the themes or relationships between the previous community and the current one.

[Output Format]
You MUST output a valid JSON object with this structure:
{
  "narrativeFlow": [
    {
      "communityId": "community_id",
      "order": 1,
      "transitionText": "Explanation of how this connects to the previous community (or introduction if first) (in Japanese)"
    }
  ]
}

[Important]
- You MUST generate a transition text for EVERY community in the list.
- The output "narrativeFlow" array must have the same number of items as the input.
- The "communityId" must match the input exactly.

[Guidelines]
- All text should be in Japanese.
- For the first community (order: 1), the transition text should be an introduction to the narrative.
- For subsequent communities, explain the connection or shift in theme from the previous one.
- Use the provided internal edges and external connections to find logical links.
`;

      const communitiesText = orderedCommunities
        .map(
          (c, idx) => `
Order ${idx + 1}: Community ${c.communityId}
- Members: ${c.memberNodeNames.slice(0, 20).join(", ")}
- Labels: ${c.memberNodeLabels?.slice(0, 10).join(", ") ?? "N/A"}
- Internal Theme: ${c.internalEdges ?? "See detailed info"}
- External Connections: ${c.externalConnections ?? "None"}
`,
        )
        .join("\n");

      console.log(
        `Regenerating transitions for ${orderedCommunities.length} communities`,
      );

      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `以下の順序でコミュニティをつなぐトランジションテキストを生成してください:\n\n${communitiesText}`,
        },
      ]);

      const responseText = response.content as string;
      console.log(
        "LLM Response for transitions:",
        responseText.substring(0, 200) + "...",
      );

      // JSONを抽出
      let jsonText = responseText.trim();
      if (jsonText.includes("```json")) {
        jsonText =
          jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
      } else if (jsonText.includes("```")) {
        jsonText =
          jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
      }

      try {
        const result = JSON.parse(jsonText) as {
          narrativeFlow: Array<{
            communityId: string;
            order: number;
            transitionText: string;
          }>;
        };

        // LLMが全てのコミュニティを含めていない場合や、順序が間違っている場合のフォールバック
        // 入力された順序を維持し、LLMの結果をマージする
        const finalFlow = orderedCommunityIds.map((id, index) => {
          // IDで検索
          let llmResult = result.narrativeFlow.find(
            (flow) => String(flow.communityId) === String(id),
          );

          // IDで見つからない場合は順序(order)で検索
          if (!llmResult) {
            llmResult = result.narrativeFlow.find(
              (flow) => flow.order === index + 1,
            );
          }

          return {
            communityId: id,
            order: index + 1,
            transitionText: llmResult?.transitionText ?? "",
          };
        });

        return {
          narrativeFlow: finalFlow,
        };
      } catch (error) {
        console.error("Failed to parse narrative flow JSON", error);
        // フォールバック: 単純な順序のみ返す
        return {
          narrativeFlow: orderedCommunityIds.map((id, index) => ({
            communityId: id,
            order: index + 1,
            transitionText: "",
          })),
        };
      }
    }),
};
