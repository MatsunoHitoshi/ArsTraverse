import type { PrismaClient } from "@prisma/client";
import { google } from "googleapis";
import { env } from "@/env";
import { GOOGLE_DRIVE_READONLY_SCOPE } from "./oauth-state";

export function getGoogleOAuthRedirectUri(): string {
  const base = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${base}/api/google-drive/callback`;
}

export function createGoogleOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    getGoogleOAuthRedirectUri(),
  );
}

export function buildGoogleDriveConnectUrl(input: {
  userId: string;
  returnTo: string;
  state: string;
}): string {
  const client = createGoogleOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GOOGLE_DRIVE_READONLY_SCOPE],
    state: input.state,
    include_granted_scopes: true,
  });
}

export async function upsertUserGoogleDriveConnection(
  db: PrismaClient,
  input: {
    userId: string;
    refreshToken: string;
    scope: string;
    expiresAt: Date | null;
  },
) {
  return db.userGoogleDriveConnection.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      refreshToken: input.refreshToken,
      scope: input.scope,
      expiresAt: input.expiresAt,
    },
    update: {
      refreshToken: input.refreshToken,
      scope: input.scope,
      expiresAt: input.expiresAt,
    },
  });
}

export async function getUserGoogleDriveAccessToken(
  db: PrismaClient,
  userId: string,
): Promise<string> {
  const connection = await db.userGoogleDriveConnection.findUnique({
    where: { userId },
  });

  if (!connection?.refreshToken) {
    throw new Error(
      "Google Drive が未連携です。リポジトリ画面から Drive を連携してください。",
    );
  }

  const client = createGoogleOAuth2Client();
  client.setCredentials({
    refresh_token: connection.refreshToken,
  });

  const { credentials } = await client.refreshAccessToken();
  const accessToken = credentials.access_token;
  if (!accessToken) {
    throw new Error("Google Drive アクセストークンの更新に失敗しました");
  }

  if (credentials.expiry_date) {
    await db.userGoogleDriveConnection.update({
      where: { userId },
      data: { expiresAt: new Date(credentials.expiry_date) },
    });
  }

  return accessToken;
}

export async function getGoogleDriveClientForUser(
  db: PrismaClient,
  userId: string,
) {
  const connection = await db.userGoogleDriveConnection.findUnique({
    where: { userId },
  });

  if (!connection?.refreshToken) {
    throw new Error(
      "Google Drive が未連携です。リポジトリ画面から Drive を連携してください。",
    );
  }

  const client = createGoogleOAuth2Client();
  client.setCredentials({
    refresh_token: connection.refreshToken,
  });

  return google.drive({ version: "v3", auth: client });
}

export async function hasUserGoogleDriveConnection(
  db: PrismaClient,
  userId: string,
): Promise<boolean> {
  const connection = await db.userGoogleDriveConnection.findUnique({
    where: { userId },
    select: { id: true },
  });
  return Boolean(connection);
}
