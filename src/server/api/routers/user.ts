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

const localeSchema = z.enum(["ja", "en"]);

export const userRouter = createTRPCRouter({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findUnique({
      where: {
        id: ctx.session.user.id,
      },
      select: PRIVATE_USER_SELECT,
    });
  }),

  updatePreferredLocale: protectedProcedure
    .input(
      z.object({
        locale: localeSchema,
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

  updateUiLocale: protectedProcedure
    .input(
      z.object({
        locale: localeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { localeLinked: true },
      });

      const data: {
        uiLocale: string;
        preferredLocale?: string;
      } = { uiLocale: input.locale };

      if (user?.localeLinked !== false) {
        data.preferredLocale = input.locale;
      }

      return ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data,
      });
    }),

  updateLocaleSettings: protectedProcedure
    .input(
      z.object({
        uiLocale: localeSchema.optional(),
        preferredLocale: localeSchema.optional(),
        localeLinked: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const data: {
        uiLocale?: string;
        preferredLocale?: string;
        localeLinked?: boolean;
      } = {};

      if (input.localeLinked !== undefined) {
        data.localeLinked = input.localeLinked;
      }
      if (input.uiLocale !== undefined) {
        data.uiLocale = input.uiLocale;
        if (input.localeLinked ?? true) {
          data.preferredLocale = input.uiLocale;
        }
      }
      if (input.preferredLocale !== undefined) {
        data.preferredLocale = input.preferredLocale;
      }

      return ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data,
      });
    }),

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
