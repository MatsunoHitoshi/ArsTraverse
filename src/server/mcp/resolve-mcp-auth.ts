import type { NextRequest } from "next/server";
import { getServerAuthSession } from "@/server/auth";
import { db } from "@/server/db";
import type { McpDraftHandlerCtx } from "@/server/mcp/graph-edit-draft-handlers";
import {
  isTopicSpaceAllowedByAccessToken,
  verifyMcpAccessToken,
} from "@/server/mcp/mcp-access-token";

export type McpAuthMethod = "access_token" | "session" | "none";

export type McpAuthContext = {
  userId: string | null;
  userAuthToken: string | null;
  authMethod: McpAuthMethod;
};

function parseBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1]?.trim() ?? null;
}

async function resolveUserAuthTokenFromUserId(
  userId: string,
  request: NextRequest,
): Promise<string | null> {
  const fromHeader = request.headers.get("User-Authorization");
  if (fromHeader) {
    return fromHeader;
  }

  const account = await db.account.findFirst({
    where: { userId },
    select: { id_token: true },
    orderBy: { updatedAt: "desc" },
  });

  return account?.id_token ?? null;
}

async function resolveAccessTokenAuth(
  bearerToken: string,
  request: NextRequest,
  topicSpaceId: string,
): Promise<
  | { ok: true; auth: McpAuthContext; draftCtx: McpDraftHandlerCtx }
  | { ok: false; status: number; message: string }
  | null
> {
  const payload = verifyMcpAccessToken(bearerToken);
  if (!payload) {
    return null;
  }

  if (!isTopicSpaceAllowedByAccessToken(payload, topicSpaceId)) {
    return {
      ok: false,
      status: 403,
      message: "This access token is not authorized for this TopicSpace",
    };
  }

  const userAuthToken = await resolveUserAuthTokenFromUserId(
    payload.sub,
    request,
  );

  return {
    ok: true,
    auth: {
      userId: payload.sub,
      userAuthToken,
      authMethod: "access_token",
    },
    draftCtx: { db, userId: payload.sub },
  };
}

export async function resolvePlatformMcpAuth(
  request: NextRequest,
): Promise<
  | { ok: true; auth: McpAuthContext; draftCtx: McpDraftHandlerCtx | null }
  | { ok: false; status: number; message: string }
> {
  return resolveMcpAuth(request, null);
}

export async function resolveMcpAuth(
  request: NextRequest,
  topicSpaceId: string | null,
): Promise<
  | { ok: true; auth: McpAuthContext; draftCtx: McpDraftHandlerCtx | null }
  | { ok: false; status: number; message: string }
> {
  const bearerToken = parseBearerToken(request.headers.get("Authorization"));

  if (bearerToken) {
    if (topicSpaceId) {
      const accessTokenResult = await resolveAccessTokenAuth(
        bearerToken,
        request,
        topicSpaceId,
      );
      if (accessTokenResult?.ok) {
        return accessTokenResult;
      }
      if (accessTokenResult && !accessTokenResult.ok) {
        return accessTokenResult;
      }
    } else {
      const payload = verifyMcpAccessToken(bearerToken);
      if (payload) {
        const userAuthToken = await resolveUserAuthTokenFromUserId(
          payload.sub,
          request,
        );
        return {
          ok: true,
          auth: {
            userId: payload.sub,
            userAuthToken,
            authMethod: "access_token",
          },
          draftCtx: { db, userId: payload.sub },
        };
      }
    }

    return {
      ok: false,
      status: 401,
      message: "Invalid MCP bearer token",
    };
  }

  const session = await getServerAuthSession();
  const userId = session?.user?.id ?? null;
  const userAuthToken = userId
    ? await resolveUserAuthTokenFromUserId(userId, request)
    : null;

  return {
    ok: true,
    auth: {
      userId,
      userAuthToken,
      authMethod: userId ? "session" : "none",
    },
    draftCtx: userId ? { db, userId } : null,
  };
}
