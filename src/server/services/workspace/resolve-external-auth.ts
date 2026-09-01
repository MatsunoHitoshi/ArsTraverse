import type { NextRequest } from "next/server";
import { resolvePlatformMcpAuth } from "@/server/mcp/resolve-mcp-auth";

/**
 * 外部アプリ向け Workspace API の認証。
 * MCP と同じく Bearer トークン（/mcp/authorize）または NextAuth セッション。
 */
export async function resolveExternalWorkspaceUser(
  request: NextRequest,
): Promise<
  | { ok: true; userId: string; authMethod: "access_token" | "session" }
  | { ok: false; status: number; message: string }
> {
  const auth = await resolvePlatformMcpAuth(request);
  if (!auth.ok) {
    return auth;
  }

  if (!auth.auth.userId) {
    return {
      ok: false,
      status: 401,
      message:
        "Authorization Bearer MCP token is required. Issue one at /mcp/authorize",
    };
  }

  return {
    ok: true,
    userId: auth.auth.userId,
    authMethod: auth.auth.authMethod === "session" ? "session" : "access_token",
  };
}
