import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { getTreeLayoutData } from "@/app/_utils/kg/get-tree-layout-data";
import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";

export const treeGraphRouter = createTRPCRouter({
  getByNodeId: publicProcedure
    .input(
      z.object({
        topicSpaceId: z.string(),
        nodeId: z.string(),
        edgeType: z.enum(["IN", "OUT", "BOTH"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const topicSpace = await ctx.db.topicSpace.findFirst({
        where: { id: input.topicSpaceId },
        include: {
          graphNodes: true,
          graphRelationships: true,
        },
      });

      if (!topicSpace) throw new Error("TopicSpace not found");

      const topicSpaceGraphData = {
        nodes: topicSpace.graphNodes,
        relationships: topicSpace.graphRelationships,
      };

      if (!topicSpaceGraphData) throw new Error("GraphData not found");

      const treeData = getTreeLayoutData(
        formGraphDataForFrontend(topicSpaceGraphData),
        input.nodeId,
        input.edgeType,
      );
      if (!treeData) throw new Error("TreeData not found");

      return treeData;
    }),
});
