import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { z } from "zod";

export const graphEmbeddingRouter = createTRPCRouter({
  createEmbeddingQueue: publicProcedure
    .input(
      z.object({
        topicSpaceId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { topicSpaceId } = input;

      const topicSpace = await ctx.db.topicSpace.findUnique({
        where: {
          id: topicSpaceId,
        },
      });

      if (!topicSpace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Topic space not found",
        });
      }

      const existingJob = await ctx.db.graphEmbeddingQueue.findFirst({
        where: {
          topicSpaceId: topicSpaceId,
        },
      });

      if (existingJob) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Embedding job already exists",
        });
      }

      const newJob = await ctx.db.graphEmbeddingQueue.create({
        data: {
          topicSpaceId: topicSpaceId,
          status: "PENDING",
        },
      });

      return newJob;
    }),
});
