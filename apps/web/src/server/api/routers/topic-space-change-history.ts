import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { GraphChangeRecordType } from "@prisma/client";

export const topicSpaceChangeHistoryRouter = createTRPCRouter({
  listByTopicSpaceId: publicProcedure
    .input(z.object({ id: z.string(), includeDetail: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const changeHistory = await ctx.db.graphChangeHistory.findMany({
        where: {
          recordId: input.id,
          recordType: GraphChangeRecordType.TOPIC_SPACE,
        },
        include: {
          user: true,
          nodeLinkChangeHistories: input.includeDetail ?? false,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      return changeHistory;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const changeHistory = await ctx.db.graphChangeHistory.findFirst({
        where: {
          id: input.id,
        },
        include: {
          nodeLinkChangeHistories: true,
        },
      });

      return changeHistory;
    }),
});
