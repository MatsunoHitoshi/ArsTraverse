import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const userRouter = createTRPCRouter({
  // ユーザーのプロフィール情報を取得
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findUnique({
      where: {
        id: ctx.session.user.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        preferredLocale: true,
        image: true,
      },
    });
  }),

  // ユーザーの言語設定を更新
  updatePreferredLocale: protectedProcedure
    .input(
      z.object({
        locale: z.enum(["ja", "en"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: {
          id: ctx.session.user.id,
        },
        data: {
          preferredLocale: input.locale,
        },
      });
    }),

  // ユーザーの現在の言語設定を取得
  getPreferredLocale: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: {
        id: ctx.session.user.id,
      },
      select: {
        preferredLocale: true,
      },
    });

    return user?.preferredLocale ?? "ja";
  }),
});
