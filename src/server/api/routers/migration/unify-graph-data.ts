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

export const migrationRouter = createTRPCRouter({
  unifyGraphData: publicProcedure.mutation(async ({ ctx }) => {
    const logs: string[] = [];
    logs.push("Starting data migration via tRPC...");

    try {
      // 1. DocumentGraphのデータ移行
      const documentGraphs = await ctx.db.documentGraph.findMany({
        where: {
          dataJson: {
            not: "null",
          },
        },
      });

      logs.push(`Found ${documentGraphs.length} DocumentGraphs to migrate.`);

      for (const docGraph of documentGraphs) {
        const graphData = docGraph.dataJson as PrevGraphDocument;
        if (!graphData?.nodes || !graphData?.relationships) {
          logs.push(
            `Skipping DocumentGraph ${docGraph.id} due to invalid data format.`,
          );
          continue;
        }

        try {
          await ctx.db.$transaction(async (tx) => {
            logs.push(`Migrating DocumentGraph ${docGraph.id}...`);
            const oldToNewNodeIdMap = new Map<number, string>();

            for (const node of graphData.nodes) {
              const newNode = await tx.graphNode.create({
                data: {
                  name: node.name,
                  label: node.label,
                  properties: node.properties ?? {},
                  documentGraphId: docGraph.id,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              });
              oldToNewNodeIdMap.set(node.id, newNode.id);
            }

            for (const link of graphData.relationships) {
              const sourceId = oldToNewNodeIdMap.get(link.sourceId);
              const targetId = oldToNewNodeIdMap.get(link.targetId);

              if (!sourceId || !targetId) {
                throw new Error(
                  `Could not find new node ID for source/target in link: ${JSON.stringify(link)}`,
                );
              }

              await tx.graphRelationship.create({
                data: {
                  type: link.type,
                  properties: link.properties ?? {},
                  fromNodeId: sourceId,
                  toNodeId: targetId,
                  documentGraphId: docGraph.id,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              });
            }
            logs.push(`Successfully migrated DocumentGraph ${docGraph.id}`);
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logs.push(
            `Failed to migrate DocumentGraph ${docGraph.id}: ${errorMessage}`,
          );
        }
      }

      // 2. TopicSpaceのデータ移行
      const topicSpaces = await ctx.db.topicSpace.findMany({
        where: {
          graphData: {
            not: "null",
          },
        },
      });

      logs.push(`Found ${topicSpaces.length} TopicSpaces to migrate.`);

      for (const topicSpace of topicSpaces) {
        const graphData = topicSpace.graphData as PrevGraphDocument;
        if (!graphData?.nodes || !graphData?.relationships) {
          logs.push(
            `Skipping TopicSpace ${topicSpace.id} due to invalid data format.`,
          );
          continue;
        }

        try {
          await ctx.db.$transaction(async (tx) => {
            logs.push(`Migrating TopicSpace ${topicSpace.id}...`);
            const oldToNewNodeIdMap = new Map<number, string>();

            for (const node of graphData.nodes) {
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
              oldToNewNodeIdMap.set(node.id, newNode.id);
            }

            for (const link of graphData.relationships) {
              const sourceId = oldToNewNodeIdMap.get(link.sourceId);
              const targetId = oldToNewNodeIdMap.get(link.targetId);

              if (!sourceId || !targetId) {
                throw new Error(
                  `Could not find new node ID for source/target in link: ${JSON.stringify(link)}`,
                );
              }

              await tx.graphRelationship.create({
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
            }
            logs.push(`Successfully migrated TopicSpace ${topicSpace.id}`);
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logs.push(
            `Failed to migrate TopicSpace ${topicSpace.id}: ${errorMessage}`,
          );
        }
      }

      logs.push("Data migration finished.");
      return { success: true, logs };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logs.push("An unexpected error occurred during the migration process.");
      logs.push(errorMessage);
      throw new Error(logs.join("\n"));
    }
  }),
});
