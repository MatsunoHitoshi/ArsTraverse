import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/server/auth";
import {
  sanitizeReturnTo,
  signGoogleDriveOAuthState,
} from "@/server/lib/google-drive/oauth-state";
import { buildGoogleDriveConnectUrl } from "@/server/lib/google-drive/user-oauth";

export const GET = async (request: Request) => {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/api/auth/signin", request.url));
  }

  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const state = signGoogleDriveOAuthState({
    userId: session.user.id,
    returnTo,
  });

  const connectUrl = buildGoogleDriveConnectUrl({
    userId: session.user.id,
    returnTo,
    state,
  });

  return NextResponse.redirect(connectUrl);
};
