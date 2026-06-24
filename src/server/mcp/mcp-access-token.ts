import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/env";

const TOKEN_PREFIX = "mcp1";
const DEFAULT_TTL_DAYS = 90;

export type McpAccessTokenPayload = {
  sub: string;
  client: string;
  topicSpaceIds: string[];
  exp: number;
  typ: "mcp_access";
};

function getSigningSecret(): string | null {
  return env.NEXTAUTH_SECRET?.trim() ?? null;
}

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function safeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function createMcpAccessToken(input: {
  userId: string;
  clientName: string;
  topicSpaceIds: string[];
  ttlDays?: number;
}): { token: string; expiresAt: Date; payload: McpAccessTokenPayload } {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required to issue MCP access tokens");
  }

  const ttlDays = input.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  const payload: McpAccessTokenPayload = {
    sub: input.userId,
    client: input.clientName,
    topicSpaceIds: input.topicSpaceIds,
    exp: Math.floor(expiresAt.getTime() / 1000),
    typ: "mcp_access",
  };

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signBody(body, secret);
  const token = `${TOKEN_PREFIX}.${body}.${signature}`;

  return { token, expiresAt, payload };
}

export function verifyMcpAccessToken(
  token: string,
): McpAccessTokenPayload | null {
  const secret = getSigningSecret();
  if (!secret) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    return null;
  }

  const body = parts[1];
  const signature = parts[2];
  if (!body || !signature) {
    return null;
  }

  const expectedSignature = signBody(body, secret);
  if (!safeEqualStrings(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as McpAccessTokenPayload;

    if (payload.typ !== "mcp_access" || typeof payload.sub !== "string") {
      return null;
    }

    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
      return null;
    }

    if (!Array.isArray(payload.topicSpaceIds)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function isTopicSpaceAllowedByAccessToken(
  payload: McpAccessTokenPayload,
  topicSpaceId: string,
): boolean {
  if (payload.topicSpaceIds.length === 0) {
    // プラットフォーム専用トークン（/api/mcp のみ。TopicSpace MCP は不可）
    return false;
  }
  return payload.topicSpaceIds.includes(topicSpaceId);
}
