import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const GraphDocumentFrontendSchema = z.object({
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

export const snapshotRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string(),
        description: z.string().optional(),
        graphData: GraphDocumentFrontendSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { workspaceId, name, description, graphData } = input;

      // ワークスペースへのアクセス権限を確認
      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      return ctx.db.graphSnapshot.create({
        data: {
          workspaceId,
          name,
          description,
          graphData,
        },
      });
    }),

  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { workspaceId } = input;

      // ワークスペースへのアクセス権限を確認
      const workspace = await ctx.db.workspace.findFirst({
        where: {
          id: workspaceId,
          OR: [
            { userId: ctx.session.user.id },
            { collaborators: { some: { id: ctx.session.user.id } } },
          ],
        },
      });

      if (!workspace) {
        throw new Error("Workspace not found or access denied");
      }

      return ctx.db.graphSnapshot.findMany({
        where: {
          workspaceId,
          isDeleted: false,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id } = input;

      const snapshot = await ctx.db.graphSnapshot.findUnique({
        where: { id },
        include: { workspace: true },
      });

      if (!snapshot) {
        throw new Error("Snapshot not found");
      }

      // 所有者または共同編集者のみが削除可能
      const hasAccess =
        snapshot.workspace.userId === ctx.session.user.id ||
        (await ctx.db.workspace
          .findUnique({
            where: { id: snapshot.workspaceId },
            include: { collaborators: true },
          })
          .then((ws) =>
            ws?.collaborators.some((c) => c.id === ctx.session.user.id),
          ));

      if (!hasAccess) {
        throw new Error("Access denied");
      }

      return ctx.db.graphSnapshot.update({
        where: { id },
        data: { isDeleted: true },
      });
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { id } = input;

      const snapshot = await ctx.db.graphSnapshot.findUnique({
        where: { id },
        include: { workspace: true },
      });

      if (!snapshot) {
        throw new Error("Snapshot not found");
      }

      // アクセス権限チェック
      const hasAccess =
        snapshot.workspace.userId === ctx.session.user.id ||
        (await ctx.db.workspace
          .findUnique({
            where: { id: snapshot.workspaceId },
            include: { collaborators: true },
          })
          .then((ws) =>
            ws?.collaborators.some((c) => c.id === ctx.session.user.id),
          ));

      if (!hasAccess) {
        throw new Error("Access denied");
      }

      return snapshot;
    }),
});
