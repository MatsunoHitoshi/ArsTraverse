import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import type { PropertyTypeForFrontend } from "@/app/const/types";

export type PrevNodeType = {
  id: number;
  name: string;
  label: string;
  properties: PropertyTypeForFrontend;
  neighborLinkCount?: number;
  visible?: boolean;
  clustered?: { x: number; y: number };
  nodeColor?: string;
};

export type PrevRelationshipType = {
  id: number;
  sourceName: string;
  sourceId: number;
  type: string;
  targetName: string;
  targetId: number;
  properties: PropertyTypeForFrontend;
};

export type PrevGraphDocument = {
  nodes: PrevNodeType[];
  relationships: PrevRelationshipType[];
};

const BATCH_SIZE = 10; // 一度に処理するドキュメント数

export const migrationRouter = createTRPCRouter({
  unifyGraphData: publicProcedure.mutation(async ({ ctx }) => {
    const logs: string[] = [];
    logs.push("Starting data migration via tRPC...");
    console.log("Starting data migration via tRPC...");

    try {
      // 1. DocumentGraphのデータ移行
      // const documentGraphs = await ctx.db.documentGraph.findMany({
      //   where: {
      //     dataJson: {
      //       not: "null",
      //     },
      //   },
      // });

      // logs.push(`Found ${documentGraphs.length} DocumentGraphs to migrate.`);
      // console.log(`Found ${documentGraphs.length} DocumentGraphs to migrate.`);

      // // バッチ処理でDocumentGraphを処理
      // for (let i = 0; i < documentGraphs.length; i += BATCH_SIZE) {
      //   const batch = documentGraphs.slice(i, i + BATCH_SIZE);
      //   logs.push(
      //     `Processing DocumentGraph batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(documentGraphs.length / BATCH_SIZE)}`,
      //   );

      //   for (const docGraph of batch) {
      //     const graphData = docGraph.dataJson as PrevGraphDocument;
      //     if (!graphData?.nodes || !graphData?.relationships) {
      //       logs.push(
      //         `Skipping DocumentGraph ${docGraph.id} due to invalid data format.`,
      //       );
      //       console.log(
      //         `Skipping DocumentGraph ${docGraph.id} due to invalid data format.`,
      //       );
      //       continue;
      //     }

      //     try {
      //       // 個別のトランザクションで各ドキュメントを処理
      //       await ctx.db.$transaction(
      //         async (tx) => {
      //           logs.push(`Migrating DocumentGraph ${docGraph.id}...`);
      //           const oldToNewNodeIdMap = new Map<number, string>();

      //           // ノードを一括作成
      //           const nodeCreatePromises = graphData.nodes.map(async (node) => {
      //             const newNode = await tx.graphNode.create({
      //               data: {
      //                 name: node.name,
      //                 label: node.label,
      //                 properties: node.properties ?? {},
      //                 documentGraphId: docGraph.id,
      //                 createdAt: new Date(),
      //                 updatedAt: new Date(),
      //               },
      //             });
      //             return { oldId: node.id, newId: newNode.id };
      //           });

      //           const nodeResults = await Promise.all(nodeCreatePromises);
      //           nodeResults.forEach(({ oldId, newId }) => {
      //             oldToNewNodeIdMap.set(oldId, newId);
      //           });

      //           // リレーションシップを一括作成
      //           const relationshipCreatePromises = graphData.relationships.map(
      //             async (link) => {
      //               const sourceId = oldToNewNodeIdMap.get(link.sourceId);
      //               const targetId = oldToNewNodeIdMap.get(link.targetId);

      //               if (!sourceId || !targetId) {
      //                 console.log(
      //                   `Could not find new node ID for source/target in link: ${JSON.stringify(link)}`,
      //                 );
      //                 throw new Error(
      //                   `Could not find new node ID for source/target in link: ${JSON.stringify(link)}`,
      //                 );
      //               }

      //               return tx.graphRelationship.create({
      //                 data: {
      //                   type: link.type,
      //                   properties: link.properties ?? {},
      //                   fromNodeId: sourceId,
      //                   toNodeId: targetId,
      //                   documentGraphId: docGraph.id,
      //                   createdAt: new Date(),
      //                   updatedAt: new Date(),
      //                 },
      //               });
      //             },
      //           );

      //           await Promise.all(relationshipCreatePromises);
      //           logs.push(`Successfully migrated DocumentGraph ${docGraph.id}`);
      //           console.log(
      //             `Successfully migrated DocumentGraph ${docGraph.id}`,
      //           );
      //         },
      //         {
      //           timeout: 30000, // 30秒のタイムアウト
      //         },
      //       );
      //     } catch (error) {
      //       const errorMessage =
      //         error instanceof Error ? error.message : String(error);
      //       logs.push(
      //         `Failed to migrate DocumentGraph ${docGraph.id}: ${errorMessage}`,
      //       );
      //       console.log(
      //         `Failed to migrate DocumentGraph ${docGraph.id}: ${errorMessage}`,
      //       );
      //       // エラーが発生しても処理を継続
      //     }
      //   }

      //   // バッチ間で少し待機してデータベースの負荷を軽減
      //   if (i + BATCH_SIZE < documentGraphs.length) {
      //     await new Promise((resolve) => setTimeout(resolve, 1000));
      //   }
      // }

      // 2. TopicSpaceのデータ移行
      const topicSpaces = await ctx.db.topicSpace.findMany({
        where: {
          graphData: {
            not: "null",
          },
          isDeleted: false,
        },
      });

      logs.push(`Found ${topicSpaces.length} TopicSpaces to migrate.`);
      console.log(`Found ${topicSpaces.length} TopicSpaces to migrate.`);

      // バッチ処理でTopicSpaceを処理
      for (let i = 0; i < topicSpaces.length; i += BATCH_SIZE) {
        const batch = topicSpaces.slice(i, i + BATCH_SIZE);
        logs.push(
          `Processing TopicSpace batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(topicSpaces.length / BATCH_SIZE)}`,
        );

        for (const topicSpace of batch) {
          const graphData = topicSpace.graphData as PrevGraphDocument;
          if (!graphData?.nodes || !graphData?.relationships) {
            logs.push(
              `Skipping TopicSpace ${topicSpace.id} due to invalid data format.`,
            );
            console.log(
              `Skipping TopicSpace ${topicSpace.id} due to invalid data format.`,
            );
            continue;
          }

          const nodeData = await ctx.db.graphNode.findMany({
            where: {
              topicSpaceId: topicSpace.id,
            },
          });

          if (nodeData.length > 0) {
            logs.push(
              `Skipping TopicSpace ${topicSpace.id} due to existing nodes.`,
            );
            console.log(
              `Skipping TopicSpace ${topicSpace.id} due to existing nodes.`,
            );
            continue;
          }

          try {
            // 個別のトランザクションで各トピックスペースを処理
            await ctx.db.$transaction(
              async (tx) => {
                logs.push(`Migrating TopicSpace ${topicSpace.id}...`);
                const oldToNewNodeIdMap = new Map<number, string>();

                // ノードを一括作成
                const nodeCreatePromises = graphData.nodes.map(async (node) => {
                  const newNode = await tx.graphNode.create({
                    data: {
                      name: node.name,
                      label: node.label,
                      properties: node.properties ?? {},
                      topicSpaceId: topicSpace.id,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    },
                  });
                  return { oldId: node.id, newId: newNode.id };
                });

                const nodeResults = await Promise.all(nodeCreatePromises);
                nodeResults.forEach(({ oldId, newId }) => {
                  oldToNewNodeIdMap.set(oldId, newId);
                });

                // リレーションシップを一括作成
                const relationshipCreatePromises = graphData.relationships.map(
                  async (link) => {
                    const sourceId = oldToNewNodeIdMap.get(link.sourceId);
                    const targetId = oldToNewNodeIdMap.get(link.targetId);

                    if (!sourceId || !targetId) {
                      console.log(
                        `Could not find new node ID for source/target in link: ${JSON.stringify(link)}`,
                      );
                      throw new Error(
                        `Could not find new node ID for source/target in link: ${JSON.stringify(link)}`,
                      );
                    }

                    return tx.graphRelationship.create({
                      data: {
                        type: link.type,
                        properties: link.properties ?? {},
                        fromNodeId: sourceId,
                        toNodeId: targetId,
                        topicSpaceId: topicSpace.id,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                      },
                    });
                  },
                );

                await Promise.all(relationshipCreatePromises);
                logs.push(`Successfully migrated TopicSpace ${topicSpace.id}`);
                console.log(
                  `Successfully migrated TopicSpace ${topicSpace.id}`,
                );
              },
              {
                timeout: 50000, // 50秒のタイムアウト
              },
            );
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logs.push(
              `Failed to migrate TopicSpace ${topicSpace.id}: ${errorMessage}`,
            );
            console.log(
              `Failed to migrate TopicSpace ${topicSpace.id}: ${errorMessage}`,
            );
            // エラーが発生しても処理を継続
          }
        }

        // バッチ間で少し待機してデータベースの負荷を軽減
        if (i + BATCH_SIZE < topicSpaces.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      logs.push("Data migration finished.");
      console.log("Data migration finished.");
      return { success: true, logs };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logs.push("An unexpected error occurred during the migration process.");
      logs.push(errorMessage);
      console.log("An unexpected error occurred during the migration process.");
      console.log(errorMessage);
      throw new Error(logs.join("\n"));
    }
  }),
});
