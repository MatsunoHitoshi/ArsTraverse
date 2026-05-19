import { z } from "zod";
import { createMcpHandler } from "@vercel/mcp-adapter";
import { api } from "@/trpc/server";
import type { NextRequest } from "next/server";
import { getServerAuthSession } from "@/server/auth";
import { db } from "@/server/db";

type DuplicateCandidate = {
  id: string;
  name: string;
  label: string;
  similarityScore: number;
  matchSource: "embedding" | "string";
};

async function resolveUserAuthToken(
  request: NextRequest,
): Promise<string | null> {
  const fromHeader = request.headers.get("User-Authorization");
  if (fromHeader) {
    return fromHeader;
  }

  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return null;
  }

  const account = await db.account.findFirst({
    where: { userId: session.user.id },
    select: { id_token: true },
    orderBy: { updatedAt: "desc" },
  });

  return account?.id_token ?? null;
}

function stringMatchScore(query: string, name: string): number {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (n.includes(q) || q.includes(n)) return 0.85;

  const qTokens = q.split(/[\s・\-]+/).filter((t) => t.length > 1);
  if (qTokens.length === 0) return 0;

  const matched = qTokens.filter((token) => n.includes(token)).length;
  return (matched / qTokens.length) * 0.7;
}

async function findDuplicateCandidatesViaEmbedding(
  topicSpaceId: string,
  nodeName: string,
  topK: number,
  userAuthToken: string | null,
): Promise<DuplicateCandidate[]> {
  if (!userAuthToken || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return [];
  }

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "";

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/node-name-embedding-query-rpc-in-user-resources`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
        "User-Authorization": userAuthToken,
      },
      body: JSON.stringify({
        name: nodeName,
        resourceType: "topicSpace",
        resourceId: topicSpaceId,
      }),
    },
  );

  if (!response.ok) {
    console.error(
      "node-name-embedding-query failed:",
      response.status,
      await response.text(),
    );
    return [];
  }

  const nodes = (await response.json()) as Array<{
    id?: string;
    name?: string;
    label?: string;
    similarity?: number;
  }>;

  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes
    .filter(
      (
        node,
      ): node is {
        id: string;
        name: string;
        label?: string;
        similarity?: number;
      } => !!node.id && !!node.name,
    )
    .map((node) => ({
      id: node.id,
      name: node.name,
      label: node.label ?? "",
      similarityScore:
        typeof node.similarity === "number" ? node.similarity : 0,
      matchSource: "embedding" as const,
    }))
    .slice(0, topK);
}

function findDuplicateCandidatesViaStringMatch(
  nodes: Array<{ id: string; name: string; label: string }>,
  nodeName: string,
  topK: number,
): DuplicateCandidate[] {
  return nodes
    .map((node) => ({
      id: node.id,
      name: node.name,
      label: node.label,
      similarityScore: stringMatchScore(nodeName, node.name),
      matchSource: "string" as const,
    }))
    .filter((candidate) => candidate.similarityScore > 0)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, topK);
}

function mergeDuplicateCandidates(
  candidates: DuplicateCandidate[],
  topK: number,
): DuplicateCandidate[] {
  const byId = new Map<string, DuplicateCandidate>();

  for (const candidate of candidates) {
    const existing = byId.get(candidate.id);
    if (!existing || candidate.similarityScore > existing.similarityScore) {
      byId.set(candidate.id, candidate);
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, topK);
}

// topicSpaceId ごとに専用のハンドラを生成するファクトリ関数
const createHandlerForTopicSpace = (
  topicSpaceId: string,
  topicSpaceName: string,
  topicSpaceMcpToolIdentifier: string,
  userAuthToken: string | null,
) => {
  return createMcpHandler(
    (server) => {
      const searchRelationToolName = `search_topics_relations_in_${topicSpaceMcpToolIdentifier.toLowerCase()}`;
      const searchRelationBetweenNodesToolName = `search_relation_between_nodes_in_${topicSpaceMcpToolIdentifier.toLowerCase()}`;
      const getContextualDescriptionToolName = `get_contextual_description_from_${topicSpaceMcpToolIdentifier.toLowerCase()}`;
      const getDetailReferenceToolName = `get_detail_reference_from_${topicSpaceMcpToolIdentifier.toLowerCase()}`;

      server.tool(
        searchRelationToolName,
        `ユーザーが${topicSpaceName}、について質問したり調査を依頼した際に必ず使用してください。情報源「${topicSpaceName}」からキーワードに一致する情報を検索し、ユーザーの質問に答えるための関連情報を提供します。`,
        {
          queries: z
            .array(z.string())
            .describe(
              "ユーザーの質問から抽出した、検索の核となるキーワードの配列。",
            ),
        },
        async ({ queries }) => {
          try {
            const results = await api.mcp.searchTopicSpacePublic({
              topicSpaceId,
              queries: queries,
            });
            if (results.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: `「${queries.map((query) => `"${query}"`).join(", ")}」に一致する情報は見つかりませんでした。`,
                  },
                ],
              };
            }
            const textResponse =
              "以下の情報とそれぞれの関連情報が見つかりました。さらに詳しい関係性や具体的な言及箇所を知りたい場合は、ノードのIDをもとにそれぞれのツールを利用してください。\n" +
              results
                .map(
                  (result) =>
                    `- (ID: ${result.node.id}, name: ${result.node.name}, label: ${result.node.label}, properties: ${JSON.stringify(result.node.properties)}) \n### ノードの関連情報\n` +
                    result.relatedNodesAndRelationships.relatedNodes
                      .map(({ relationship }) => {
                        const sourceNode =
                          result.relatedNodesAndRelationships.graphSubset.nodes.find(
                            (n) => n?.id === relationship?.fromNodeId,
                          );
                        const targetNode =
                          result.relatedNodesAndRelationships.graphSubset.nodes.find(
                            (n) => n?.id === relationship?.toNodeId,
                          );
                        return `  - (ID: ${sourceNode?.id}, name: ${sourceNode?.name})-[${relationship?.type}]->(ID: ${targetNode?.id}, name: ${targetNode?.name})\n`;
                      })
                      .join(""),
                )
                .join("\n");
            return {
              content: [{ type: "text", text: textResponse }],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "検索中にエラーが発生しました。" },
              ],
            };
          }
        },
      );

      server.tool(
        searchRelationBetweenNodesToolName,
        `${searchRelationToolName}で検索した特定のノードについて、さらに任意の二つのノード間の関係性を知りたい場合に利用します。ユーザーが検索結果の中から二つのノードを選んで『どのような関係性があるか』『どのように繋がっているか』など依頼した場合などに呼び出してください。`,
        {
          startNodeId: z
            .string()
            .describe(
              `${searchRelationToolName}で見つかったノードのID。このツールを呼ぶ前に、必ず${searchRelationToolName}を実行してIDを取得している必要があります。`,
            ),
          startNodeName: z
            .string()
            .describe(
              `${searchRelationToolName}で見つかったノードの名前。このツールを呼ぶ前に、必ず${searchRelationToolName}を実行して名前を取得している必要があります。`,
            ),
          endNodeId: z
            .string()
            .describe(
              `${searchRelationToolName}で見つかったノードのID。このツールを呼ぶ前に、必ず${searchRelationToolName}を実行してIDを取得している必要があります。`,
            ),
          endNodeName: z
            .string()
            .describe(
              `${searchRelationToolName}で見つかったノードの名前。このツールを呼ぶ前に、必ず${searchRelationToolName}を実行して名前を取得している必要があります。`,
            ),
        },
        async ({ startNodeId, endNodeId, startNodeName, endNodeName }) => {
          try {
            const results = await api.topicSpaces.getPath({
              id: topicSpaceId,
              startId: startNodeId,
              endId: endNodeId,
            });

            let textResponse = "";

            switch (true) {
              case results.graphData.nodes.length > 0:
                textResponse = `## ${startNodeName}と${endNodeName}の関係性\n\n`;
                textResponse += results.graphData.relationships
                  .map((relationship) => {
                    return `- [${relationship.type}] - (ID: ${relationship.sourceId}, name: ${relationship.sourceId}, label: ${relationship.sourceId}, properties: ${JSON.stringify(relationship.sourceId)})`;
                  })
                  .join("\n");

                break;
              case results.graphData.nodes.length === 0:
                textResponse = `${startNodeName}と${endNodeName}の関係性が見つかりませんでしたが、このノード間には下記の関係性が予測されました\n\n`;

                // 推論データを取得
                try {
                  const response = await fetch(
                    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/trans-e-predict-relations-query-rpc`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization:
                          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
                      },
                      body: JSON.stringify({
                        head: startNodeName,
                        tail: endNodeName,
                        topicSpaceId: topicSpaceId,
                      }),
                    },
                  );

                  if (response.ok) {
                    const predictedRelationships =
                      (await response.json()) as Array<{
                        relation: string;
                        score: number;
                      }>;
                    console.log(
                      "predictedRelationships: ",
                      predictedRelationships,
                    );
                    textResponse += predictedRelationships
                      .map(
                        (rel) => `- [${rel.relation}] - 信頼度: ${rel.score}`,
                      )
                      .join("\n");
                  } else {
                    console.error(response);
                    textResponse += "推論データの取得に失敗しました。";
                  }
                } catch (error) {
                  console.error(error);
                  textResponse += "推論データの取得に失敗しました。";
                }

                break;

              default:
                textResponse = "関係性が見つかりませんでした。";
                break;
            }

            return {
              content: [{ type: "text", text: textResponse }],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                {
                  type: "text",
                  text: "関係性の取得中にエラーが発生しました。",
                },
              ],
            };
          }
        },
      );

      server.tool(
        getContextualDescriptionToolName,
        `${searchRelationToolName}で検索した特定のトピックについて、一つのノードに関する文脈的な解説を取得する場合に利用します。ユーザーが検索結果の中から一つを選んで『もっと詳しく』と依頼した場合などに呼び出してください。`,
        {
          nodeId: z
            .string()
            .describe(
              `${searchRelationToolName}で見つかったトピックのID。このツールを呼ぶ前に、必ず${searchRelationToolName}を実行してIDを取得している必要があります。`,
            ),
        },
        async ({ nodeId }) => {
          try {
            const result = await api.mcp.getContextKnowledgeForNodePublic({
              topicSpaceId,
              nodeId,
            });

            let textResponse = `## ${result.nodeDetails.name}についての解説\n\n`;
            textResponse += `${result.summary}\n\n`;
            textResponse += "### 関連情報\n";
            if (result.relatedNodes.length > 0) {
              textResponse += result.relatedNodes
                .map(({ node, relationship }) => {
                  return `- [${relationship.type}] - (ID: ${node.id}, name: ${node.name}, label: ${node.label}, properties: ${JSON.stringify(node.properties)})`;
                })
                .join("\n");
            } else {
              textResponse += "関連情報はありません。";
            }

            return {
              content: [{ type: "text", text: textResponse }],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                {
                  type: "text",
                  text: "解説の取得中にエラーが発生しました。",
                },
              ],
            };
          }
        },
      );

      server.tool(
        getDetailReferenceToolName,
        `ユーザーが${topicSpaceName}、について質問したり調査を依頼した際に必ず使用してください。情報源「${topicSpaceName}」からユーザーが指定したノードに関する具体的な言及箇所を検索し、ユーザーの質問に答えるための関連情報を提供します。`,
        {
          keywords: z.array(z.string()).describe(`キーワードの配列。`),
        },
        async ({ keywords }) => {
          try {
            const topicSpace = await api.topicSpaces.getByIdPublic({
              id: topicSpaceId,
            });

            if (!topicSpace.sourceDocuments) {
              throw new Error("Source documents not found");
            }

            const results = await Promise.all(
              topicSpace.sourceDocuments.map(async (document) => {
                const result =
                  await api.sourceDocument.getReferenceSectionsById({
                    id: document.id,
                    searchTerms: keywords,
                  });
                return {
                  name: document.name,
                  id: document.id,
                  text: result.join("\n---\n"),
                };
              }),
            );

            const textResponse = results
              .map((result) => {
                return `## ${result.name} (ID: ${result.id})\n\n${result.text}`;
              })
              .join("\n\n");

            return {
              content: [{ type: "text", text: textResponse }],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                {
                  type: "text",
                  text: "言及場所の取得中にエラーが発生しました。",
                },
              ],
            };
          }
        },
      );

      const identifier = topicSpaceMcpToolIdentifier.toLowerCase();

      // ---------------------------------------------------------
      // KGアライメント（調査）ツール群
      // ---------------------------------------------------------
      const listTopicSpaceGraphToolName = `list_topic_space_graph_in_${identifier}`;
      const findDuplicateNodeCandidatesToolName = `find_duplicate_node_candidates_in_${identifier}`;
      const findExactDuplicateNodeGroupsToolName = `find_exact_duplicate_node_groups_in_${identifier}`;

      server.tool(
        listTopicSpaceGraphToolName,
        `${topicSpaceName} の知識グラフ（ノード・エッジ）を一覧します。表記ゆれや重複の洗い出し、アライメント作業の起点として利用してください。`,
        {
          offset: z
            .number()
            .int()
            .min(0)
            .optional()
            .default(0)
            .describe("取得開始位置（ノード配列のオフセット）。"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(500)
            .optional()
            .default(200)
            .describe("取得件数上限（最大500）。"),
        },
        async ({ offset, limit }) => {
          try {
            const topicSpace = await api.topicSpaces.getByIdPublic({
              id: topicSpaceId,
            });

            const graphData = topicSpace.graphData;
            const allNodes = graphData.nodes.map((node) => ({
              id: node.id,
              name: node.name,
              label: node.label,
              properties: node.properties,
            }));
            const allEdges = graphData.relationships.map((rel) => ({
              id: rel.id,
              type: rel.type,
              sourceId: rel.sourceId,
              targetId: rel.targetId,
              properties: rel.properties,
            }));

            const pageNodes = allNodes.slice(offset, offset + limit);
            const nodeIdSet = new Set(pageNodes.map((n) => n.id));
            const edges = allEdges.filter(
              (rel) =>
                nodeIdSet.has(rel.sourceId) || nodeIdSet.has(rel.targetId),
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      topicSpaceId,
                      totalNodeCount: allNodes.length,
                      totalEdgeCount: allEdges.length,
                      offset,
                      limit,
                      returnedNodeCount: pageNodes.length,
                      returnedEdgeCount: edges.length,
                      nodes: pageNodes,
                      edges,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                {
                  type: "text",
                  text: "グラフ一覧の取得中にエラーが発生しました。",
                },
              ],
            };
          }
        },
      );

      server.tool(
        findDuplicateNodeCandidatesToolName,
        `${topicSpaceName} 内で、指定ノード名に類似する重複候補を検索します。embedding検索と文字列類似の両方を使います。統合前に候補を確認してください。`,
        {
          nodeName: z
            .string()
            .min(1)
            .describe("類似候補を探す基準となるノード名。"),
          topK: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .default(10)
            .describe("返却する候補の最大件数。"),
        },
        async ({ nodeName, topK }) => {
          try {
            const topicSpace = await api.topicSpaces.getByIdPublic({
              id: topicSpaceId,
            });

            const allNodes = topicSpace.graphData.nodes.map((node) => ({
              id: node.id,
              name: node.name,
              label: node.label,
            }));

            const embeddingCandidates = await findDuplicateCandidatesViaEmbedding(
              topicSpaceId,
              nodeName,
              topK,
              userAuthToken,
            );

            const stringCandidates = findDuplicateCandidatesViaStringMatch(
              allNodes,
              nodeName,
              topK,
            );

            const candidates = mergeDuplicateCandidates(
              [...embeddingCandidates, ...stringCandidates],
              topK,
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      query: nodeName,
                      candidateCount: candidates.length,
                      usedEmbedding: embeddingCandidates.length > 0,
                      candidates,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                {
                  type: "text",
                  text: "重複候補の検索中にエラーが発生しました。",
                },
              ],
            };
          }
        },
      );

      server.tool(
        findExactDuplicateNodeGroupsToolName,
        `${topicSpaceName} 全体から、name（および label）が完全一致する重複ノードのグループを一括検出します。
アライメント作業の起点として、${findDuplicateNodeCandidatesToolName} より先に使うことを推奨します。`,
        {
          requireSameLabel: z
            .boolean()
            .optional()
            .default(true)
            .describe(
              "true のとき name と label の両方が一致するノードのみ同一グループとみなします。",
            ),
          minGroupSize: z
            .number()
            .int()
            .min(2)
            .optional()
            .default(2)
            .describe("グループとして返す最小ノード数。"),
        },
        async ({ requireSameLabel, minGroupSize }) => {
          try {
            const result = await api.mcp.findExactDuplicateNodeGroupsPublic({
              topicSpaceId,
              requireSameLabel,
              minGroupSize,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                {
                  type: "text",
                  text: "完全一致重複グループの検出中にエラーが発生しました。",
                },
              ],
            };
          }
        },
      );

      const propertyValueSchema = z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
      ]);
      const propertiesRecordSchema = z
        .record(propertyValueSchema)
        .optional()
        .default({});

      // ---------------------------------------------------------
      // グラフ編集（ドラフト）基本操作ツール群
      // ---------------------------------------------------------
      const createDraftProposalToolName = `create_graph_edit_proposal_draft_in_${identifier}`;
      const upsertNodeToolName = `upsert_node_in_${identifier}`;
      const deleteNodeToolName = `delete_node_in_${identifier}`;
      const setNodePropertyToolName = `set_node_property_in_${identifier}`;
      const unsetNodePropertyToolName = `unset_node_property_in_${identifier}`;
      const upsertEdgeToolName = `upsert_edge_in_${identifier}`;
      const deleteEdgeToolName = `delete_edge_in_${identifier}`;
      const setEdgePropertyToolName = `set_edge_property_in_${identifier}`;
      const unsetEdgePropertyToolName = `unset_edge_property_in_${identifier}`;

      const getDraftGraphToolName = `get_graph_edit_proposal_draft_graph_in_${identifier}`;
      const getDraftDiffToolName = `get_graph_edit_proposal_diff_in_${identifier}`;
      const mergeNodesInDraftToolName = `merge_nodes_in_draft_in_${identifier}`;
      const submitGraphEditProposalToolName = `submit_graph_edit_proposal_in_${identifier}`;

      server.tool(
        createDraftProposalToolName,
        `まず最初に呼び出して、${topicSpaceName} の「グラフ変更提案」下書き（ドラフト）を作成してください。
推奨フロー:
1) ${upsertNodeToolName}（必要なノードを登録/更新）
2) ${upsertEdgeToolName}（ノード間の関係を登録/更新）
3) ${setNodePropertyToolName}/${unsetNodePropertyToolName} と ${setEdgePropertyToolName}/${unsetEdgePropertyToolName}（属性を確定）

以後は同じ proposalId を参照し続け、nodeId/edgeId は「登録済みのもの」を使ってください（新規IDではなく同一ID更新が安全）。
マージ/承認は Admin/UI の既存フローに委ねてください。`,
        {
          title: z
            .string()
            .min(1)
            .describe("変更提案のタイトル（1文字以上）。"),
          description: z
            .string()
            .min(10)
            .describe("変更提案の説明（10文字以上）。下書きの意図や根拠を簡潔に。"),
        },
        async ({ title, description }) => {
          try {
            const proposal = await api.graphEditProposal.createDraftProposal({
              topicSpaceId,
              title,
              description,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `下書きの変更提案を作成しました。proposalId=${proposal.id}`,
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "ドラフト提案の作成に失敗しました。" },
              ],
            };
          }
        },
      );

      server.tool(
        getDraftGraphToolName,
        `proposalId の現在のドラフト状態（ノード・エッジの id/name/label/properties を含む）を取得します。
アライメント後の統合結果を確認する際に利用してください。`,
        {
          proposalId: z.string().describe("確認したい下書き変更提案ID。"),
        },
        async ({ proposalId }) => {
          try {
            const result = await api.graphEditProposal.getProposalDraftGraph({
              proposalId,
            });

            const draftGraph = result.draftGraph;

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      proposalId,
                      status: result.proposal.status,
                      nodeCount: draftGraph.nodes.length,
                      edgeCount: draftGraph.relationships.length,
                      nodes: draftGraph.nodes.map((n) => ({
                        id: n.id,
                        name: n.name,
                        label: n.label,
                        properties: n.properties,
                      })),
                      edges: draftGraph.relationships.map((e) => ({
                        id: e.id,
                        type: e.type,
                        sourceId: e.sourceId,
                        targetId: e.targetId,
                        properties: e.properties,
                      })),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "ドラフト状態の取得に失敗しました。" },
              ],
            };
          }
        },
      );

      server.tool(
        getDraftDiffToolName,
        `proposalId の変更提案について、現在の Topic Space グラフ（ベース）とドラフトの差分を返します。
${submitGraphEditProposalToolName} の前に必ず呼び出し、変更内容を確認してください。hasChanges が false の場合は提出しないでください。`,
        {
          proposalId: z.string().describe("差分を確認する下書き変更提案ID。"),
        },
        async ({ proposalId }) => {
          try {
            const result = await api.graphEditProposal.getProposalDraftDiff({
              proposalId,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                {
                  type: "text",
                  text: "変更提案の差分取得中にエラーが発生しました。",
                },
              ],
            };
          }
        },
      );

      server.tool(
        upsertNodeToolName,
        `ドラフト提案（proposalId）に対してノードを追加/更新します。
nodeId は「このドラフト内で一意」です。以後のプロパティ更新/削除では同じ nodeId を使ってください。
ノードのpropertiesは任意のオブジェクトで、数値/真偽/ null も渡せます（tRPC側で文字列化されます）。`,
        {
          proposalId: z
            .string()
            .describe("編集対象の下書き変更提案ID。"),
          nodeId: z.string().describe("ノードID（以後の操作でも同じIDを使ってください）。"),
          name: z.string().describe("ノードの表示名。"),
          label: z.string().describe("ノードのラベル（種別）。"),
          properties: propertiesRecordSchema.describe("ノードの属性（任意）。"),
        },
        async ({ proposalId, nodeId, name, label, properties }) => {
          try {
            await api.graphEditProposal.upsertNodeInDraft({
              proposalId,
              node: {
                id: nodeId,
                name,
                label,
                properties: properties ?? {},
              },
            });
            return {
              content: [
                {
                  type: "text",
                  text: `ノードをドラフトに反映しました。nodeId=${nodeId}`,
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "ノードの反映に失敗しました。" },
              ],
            };
          }
        },
      );

      server.tool(
        deleteNodeToolName,
        `ドラフト提案からノードを削除します（nodeId）。
削除に伴い incident edges もドラフト上で削除されます。
削除後は同じ nodeId を再利用せず、必要なら別nodeIdで ${upsertNodeToolName} してください。`,
        {
          proposalId: z.string(),
          nodeId: z.string(),
        },
        async ({ proposalId, nodeId }) => {
          try {
            await api.graphEditProposal.deleteNodeInDraft({
              proposalId,
              nodeId,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `ノードを削除しました。nodeId=${nodeId}`,
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "ノード削除に失敗しました。" },
              ],
            };
          }
        },
      );

      server.tool(
        setNodePropertyToolName,
        `ドラフト提案の指定ノード（nodeId）の properties にキー/値を設定します（上書き）。
事前に ${upsertNodeToolName} で nodeId を登録しておいてください（未登録だとエラーになります）。`,
        {
          proposalId: z.string(),
          nodeId: z.string(),
          key: z.string(),
          value: propertyValueSchema,
        },
        async ({ proposalId, nodeId, key, value }) => {
          try {
            await api.graphEditProposal.setNodePropertyInDraft({
              proposalId,
              nodeId,
              key,
              value,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `ノードpropertyを設定しました。nodeId=${nodeId}, key=${key}`,
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                {
                  type: "text",
                  text: "ノードpropertyの設定に失敗しました。",
                },
              ],
            };
          }
        },
      );

      server.tool(
        unsetNodePropertyToolName,
        `ドラフト提案の指定ノード（nodeId）の properties からキーを削除します。
事前に ${upsertNodeToolName} で nodeId を登録しておいてください（未登録だとエラーになります）。
キーが存在しない場合は no-op です。`,
        {
          proposalId: z.string(),
          nodeId: z.string(),
          key: z.string(),
        },
        async ({ proposalId, nodeId, key }) => {
          try {
            await api.graphEditProposal.unsetNodePropertyInDraft({
              proposalId,
              nodeId,
              key,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `ノードpropertyを削除しました。nodeId=${nodeId}, key=${key}`,
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "ノードpropertyの削除に失敗しました。" },
              ],
            };
          }
        },
      );

      server.tool(
        upsertEdgeToolName,
        `ドラフト提案（proposalId）に対してエッジを追加/更新します。
edgeId は「このドラフト内で一意」です。以後のプロパティ更新/削除では同じ edgeId を使ってください。
sourceId と targetId（ノード）は、事前に ${upsertNodeToolName} で登録しておく必要があります（tRPC側で検証します）。
propertiesは任意です。`,
        {
          proposalId: z.string(),
          edgeId: z.string().describe("エッジID（以後の操作でも同じIDを使ってください）。"),
          type: z.string().describe("エッジのタイプ（関係の種別）。"),
          sourceId: z.string().describe("始点ノードID。"),
          targetId: z.string().describe("終点ノードID。"),
          properties: propertiesRecordSchema,
        },
        async ({ proposalId, edgeId, type, sourceId, targetId, properties }) => {
          try {
            await api.graphEditProposal.upsertRelationshipInDraft({
              proposalId,
              relationship: {
                id: edgeId,
                type,
                sourceId,
                targetId,
                properties: properties ?? {},
              },
            });
            return {
              content: [
                {
                  type: "text",
                  text: `エッジをドラフトに反映しました。edgeId=${edgeId}`,
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "エッジの反映に失敗しました。" },
              ],
            };
          }
        },
      );

      server.tool(
        deleteEdgeToolName,
        `ドラフト提案からエッジを削除します（edgeId）。
削除後は同じ edgeId を再利用せず、必要なら別edgeIdで ${upsertEdgeToolName} してください。`,
        {
          proposalId: z.string(),
          edgeId: z.string(),
        },
        async ({ proposalId, edgeId }) => {
          try {
            await api.graphEditProposal.deleteRelationshipInDraft({
              proposalId,
              relationshipId: edgeId,
            });
            return {
              content: [
                { type: "text", text: `エッジを削除しました。edgeId=${edgeId}` },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [{ type: "text", text: "エッジ削除に失敗しました。" }],
            };
          }
        },
      );

      server.tool(
        setEdgePropertyToolName,
        `ドラフト提案の指定エッジ（edgeId）の properties にキー/値を設定します（上書き）。
事前に ${upsertEdgeToolName} で edgeId を登録しておいてください（未登録だとエラーになります）。`,
        {
          proposalId: z.string(),
          edgeId: z.string(),
          key: z.string(),
          value: propertyValueSchema,
        },
        async ({ proposalId, edgeId, key, value }) => {
          try {
            await api.graphEditProposal.setRelationshipPropertyInDraft({
              proposalId,
              relationshipId: edgeId,
              key,
              value,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `エッジpropertyを設定しました。edgeId=${edgeId}, key=${key}`,
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "エッジpropertyの設定に失敗しました。" },
              ],
            };
          }
        },
      );

      server.tool(
        unsetEdgePropertyToolName,
        `ドラフト提案の指定エッジ（edgeId）の properties からキーを削除します。
事前に ${upsertEdgeToolName} で edgeId を登録しておいてください（未登録だとエラーになります）。
キーが存在しない場合は no-op です。`,
        {
          proposalId: z.string(),
          edgeId: z.string(),
          key: z.string(),
        },
        async ({ proposalId, edgeId, key }) => {
          try {
            await api.graphEditProposal.unsetRelationshipPropertyInDraft({
              proposalId,
              relationshipId: edgeId,
              key,
            });
            return {
              content: [
                {
                  type: "text",
                  text: `エッジpropertyを削除しました。edgeId=${edgeId}, key=${key}`,
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "エッジpropertyの削除に失敗しました。" },
              ],
            };
          }
        },
      );

      server.tool(
        mergeNodesInDraftToolName,
        `ドラフト提案内で複数ノードを1つに統合します。canonicalNodeId を残し、duplicateNodeIds のノードを削除してエッジを付け替えます。
推奨フロー: ${createDraftProposalToolName} → ${findDuplicateNodeCandidatesToolName} で候補確認 → 本ツール → ${getDraftGraphToolName} で確認。`,
        {
          proposalId: z.string().describe("編集対象の下書き変更提案ID。"),
          canonicalNodeId: z
            .string()
            .describe("統合後に残す正規ノードのID（既存ID）。"),
          duplicateNodeIds: z
            .array(z.string())
            .min(1)
            .describe("削除して canonical に統合するノードIDの配列。"),
          canonicalName: z
            .string()
            .optional()
            .describe("統合後の正規ノード名（省略時は現状維持）。"),
          canonicalLabel: z
            .string()
            .optional()
            .describe("統合後の正規ラベル（省略時は現状維持）。"),
          canonicalProperties: propertiesRecordSchema
            .optional()
            .describe("統合後の正規ノード properties（省略時は現状維持）。"),
        },
        async ({
          proposalId,
          canonicalNodeId,
          duplicateNodeIds,
          canonicalName,
          canonicalLabel,
          canonicalProperties,
        }) => {
          try {
            const result = await api.graphEditProposal.mergeNodesInDraft({
              proposalId,
              canonicalNodeId,
              duplicateNodeIds,
              canonicalName,
              canonicalLabel,
              canonicalProperties,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      proposalId: result.proposalId,
                      removedDuplicateNodeCount:
                        result.removedDuplicateNodeCount,
                      rewiredEdgeCount: result.rewiredEdgeCount,
                      deduplicatedEdgeCount: result.deduplicatedEdgeCount,
                      skippedDuplicateNodeIds: result.skippedDuplicateNodeIds,
                      message: `ノード統合をドラフトに反映しました。${getDraftGraphToolName} で結果を確認してください。`,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "ノード統合の反映に失敗しました。" },
              ],
            };
          }
        },
      );

      server.tool(
        submitGraphEditProposalToolName,
        `ドラフト状態の変更提案をレビュー待ち（PENDING）に提出します。提出前に ${getDraftDiffToolName} で hasChanges を確認してください。提出後は管理UIで確認・承認・マージを行ってください。`,
        {
          proposalId: z.string().describe("提出する下書き変更提案ID。"),
        },
        async ({ proposalId }) => {
          try {
            const diff = await api.graphEditProposal.getProposalDraftDiff({
              proposalId,
            });

            if (!diff.hasChanges) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        proposalId,
                        error:
                          "変更がありません。merge_nodes_in_draft 等で編集してから提出してください。",
                        hasChanges: false,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            const proposal = await api.graphEditProposal.submitProposal({
              proposalId,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      proposalId: proposal.id,
                      status: proposal.status,
                      title: proposal.title,
                      message:
                        "変更提案を提出しました。ArsTraverseの変更提案画面でレビュー・承認を行ってください。",
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error) {
            console.error(error);
            return {
              content: [
                { type: "text", text: "変更提案の提出に失敗しました。" },
              ],
            };
          }
        },
      );
    },
    {},
    { basePath: `/api/topic-spaces/${topicSpaceId}` },
  );
};

// Next.js のルートハンドラ
const routeHandler = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id: topicSpaceId } = await params;
  if (!topicSpaceId) {
    return new Response("Topic Space ID is missing", { status: 400 });
  }
  const topicSpaceInfo = await api.topicSpaces.getSummaryByIdPublic({
    id: topicSpaceId,
  });
  if (!topicSpaceInfo) {
    return new Response("Topic space not found", { status: 404 });
  }
  const userAuthToken = await resolveUserAuthToken(request);

  const handler = createHandlerForTopicSpace(
    topicSpaceId,
    topicSpaceInfo.name,
    topicSpaceInfo.mcpToolIdentifier ?? "",
    userAuthToken,
  );
  return handler(request);
};

export { routeHandler as GET, routeHandler as POST, routeHandler as DELETE };
