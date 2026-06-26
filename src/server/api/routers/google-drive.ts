import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { env } from "@/env";
import {
  getUserGoogleDriveAccessToken,
  hasUserGoogleDriveConnection,
} from "@/server/lib/google-drive/user-oauth";

export const googleDriveRouter = createTRPCRouter({
  getConnectionStatus: protectedProcedure.query(async ({ ctx }) => {
    const connected = await hasUserGoogleDriveConnection(
      ctx.db,
      ctx.session.user.id,
    );
    const connection = connected
      ? await ctx.db.userGoogleDriveConnection.findUnique({
          where: { userId: ctx.session.user.id },
          select: { scope: true, expiresAt: true, updatedAt: true },
        })
      : null;

    return {
      connected,
      scope: connection?.scope ?? null,
      expiresAt: connection?.expiresAt?.toISOString() ?? null,
      updatedAt: connection?.updatedAt?.toISOString() ?? null,
    };
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.userGoogleDriveConnection.deleteMany({
      where: { userId: ctx.session.user.id },
    });
    return { success: true };
  }),

  getPickerConfig: protectedProcedure.query(async ({ ctx }) => {
    const accessToken = await getUserGoogleDriveAccessToken(
      ctx.db,
      ctx.session.user.id,
    );

    const apiKey = env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY?.trim();
    const appId = env.NEXT_PUBLIC_GOOGLE_APP_ID?.trim();

    if (!apiKey || !appId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "NEXT_PUBLIC_GOOGLE_PICKER_API_KEY と NEXT_PUBLIC_GOOGLE_APP_ID を設定してください。",
      });
    }

    return {
      accessToken,
      apiKey,
      appId,
      clientId: env.GOOGLE_CLIENT_ID,
    };
  }),
});
