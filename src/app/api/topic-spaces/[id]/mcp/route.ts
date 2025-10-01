import { z } from "zod";
import { createMcpHandler } from "@vercel/mcp-adapter";
import { api } from "@/trpc/server";
import type { NextRequest } from "next/server";

// topicSpaceId ごとに専用のハンドラを生成するファクトリ関数
const createHandlerForTopicSpace = (
  topicSpaceId: string,
  topicSpaceName: string,
  topicSpaceMcpToolIdentifier: string,
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
          query: z
            .string()
            .describe("ユーザーの質問から抽出した、検索の核となるキーワード。"),
        },
        async ({ query }) => {
          try {
            const results = await api.mcp.searchTopicSpacePublic({
              topicSpaceId,
              query,
            });
            if (results.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: `「${query}」に一致する情報は見つかりませんでした。`,
                  },
                ],
              };
            }
            const textResponse =
              "以下の情報とそれぞれの関連情報が見つかりました。詳細を知りたいものを選択してください。\n" +
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
    },
    {},
    { basePath: `/api/topic-spaces/${topicSpaceId}` },
  );
};

// Next.js のルートハンドラ
const routeHandler = async (
  request: NextRequest,
  { params }: { params: { id: string } },
) => {
  const topicSpaceId = params.id;
  if (!topicSpaceId) {
    return new Response("Topic Space ID is missing", { status: 400 });
  }
  const topicSpaceInfo = await api.topicSpaces.getSummaryByIdPublic({
    id: topicSpaceId,
  });
  if (!topicSpaceInfo) {
    return new Response("Topic space not found", { status: 404 });
  }
  const handler = createHandlerForTopicSpace(
    topicSpaceId,
    topicSpaceInfo.name,
    topicSpaceInfo.mcpToolIdentifier ?? "",
  );
  return handler(request);
};

export { routeHandler as GET, routeHandler as POST, routeHandler as DELETE };
