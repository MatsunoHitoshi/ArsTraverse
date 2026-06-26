import { NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  createGoogleOAuth2Client,
  upsertUserGoogleDriveConnection,
} from "@/server/lib/google-drive/user-oauth";
import {
  GOOGLE_DRIVE_READONLY_SCOPE,
  sanitizeReturnTo,
  verifyGoogleDriveOAuthState,
} from "@/server/lib/google-drive/oauth-state";

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      new URL(
        `/topic-spaces?drive_error=${encodeURIComponent(oauthError)}`,
        request.url,
      ),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/topic-spaces?drive_error=missing_code", request.url),
    );
  }

  try {
    const { userId, returnTo } = verifyGoogleDriveOAuthState(state);
    const client = createGoogleOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(
          `${sanitizeReturnTo(returnTo)}?drive_error=missing_refresh_token`,
          request.url,
        ),
      );
    }

    await upsertUserGoogleDriveConnection(db, {
      userId,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope ?? GOOGLE_DRIVE_READONLY_SCOPE,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    });

    const redirectUrl = new URL(sanitizeReturnTo(returnTo), request.url);
    redirectUrl.searchParams.set("drive_connected", "1");
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "drive_oauth_failed";
    return NextResponse.redirect(
      new URL(
        `/topic-spaces?drive_error=${encodeURIComponent(message)}`,
        request.url,
      ),
    );
  }
};
