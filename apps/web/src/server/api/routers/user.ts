import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  PUBLIC_USER_SELECT,
  PRIVATE_USER_SELECT,
} from "@/server/lib/user-select";

export const userRouter = createTRPCRouter({
  // ユーザーのプロフィール情報を取得
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findUnique({
      where: {
        id: ctx.session.user.id,
      },
      select: PRIVATE_USER_SELECT,
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

  // 公開用: ユーザーIDでユーザー情報を取得
  getByIdPublic: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.user.findUnique({
        where: {
          id: input.id,
        },
        select: PUBLIC_USER_SELECT,
      });
    }),

  // ユーザーIDまたはメールアドレスでユーザーを検索（招待用）
  // 完全一致のみ。部分一致は列挙攻撃につながるため許可しない
  searchByUserIdOrEmail: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const trimmed = input.query.trim();
      if (!trimmed) return [];

      const user = await ctx.db.user.findFirst({
        where: {
          OR: [
            { id: trimmed },
            { email: { equals: trimmed, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      });

      return user ? [user] : [];
    }),
});
