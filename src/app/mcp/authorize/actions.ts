"use server";

import { getServerAuthSession } from "@/server/auth";
import { db } from "@/server/db";
import { createMcpAccessToken } from "@/server/mcp/mcp-access-token";
import { env } from "@/env";
import {
  PLATFORM_MCP_SCOPE,
  type IssueMcpTokenResult,
} from "./types";

export type { IssueMcpTokenResult } from "./types";

export async function issueMcpAccessToken(input: {
  clientName: string;
  topicSpaceId?: string;
}): Promise<IssueMcpTokenResult> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return { ok: false, error: "ログインが必要です。" };
  }

  const clientName = input.clientName.trim();
  const topicSpaceId = input.topicSpaceId?.trim() ?? "";
  const isPlatformOnly =
    !topicSpaceId || topicSpaceId === PLATFORM_MCP_SCOPE;

  if (!clientName) {
    return { ok: false, error: "クライアント名を入力してください。" };
  }

  let topicSpace: { id: string; name: string } | null = null;
  if (!isPlatformOnly) {
    topicSpace = await db.topicSpace.findFirst({
      where: {
        id: topicSpaceId,
        isDeleted: false,
        admins: { some: { id: session.user.id } },
      },
      select: { id: true, name: true },
    });

    if (!topicSpace) {
      return {
        ok: false,
        error: "TopicSpace が見つからないか、アクセス権限がありません。",
      };
    }
  }

  try {
    const { token, expiresAt } = createMcpAccessToken({
      userId: session.user.id,
      clientName,
      topicSpaceIds: topicSpace ? [topicSpace.id] : [],
    });

    const baseUrl = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
    const platformMcpUrl = `${baseUrl}/api/mcp`;
    const topicSpaceMcpUrl = topicSpace
      ? `${baseUrl}/api/topic-spaces/${topicSpace.id}/mcp`
      : null;

    const mcpServers: Record<
      string,
      { url: string; headers: { Authorization: string } }
    > = {
      "arstraverse-platform": {
        url: platformMcpUrl,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    };

    if (topicSpace && topicSpaceMcpUrl) {
      mcpServers[`arstraverse-${topicSpace.id.slice(0, 8)}`] = {
        url: topicSpaceMcpUrl,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };
    }

    const cursorConfigJson = JSON.stringify({ mcpServers }, null, 2);

    return {
      ok: true,
      token,
      expiresAt: expiresAt.toISOString(),
      clientName,
      scope: isPlatformOnly ? "platform" : "topic_space",
      topicSpaceId: topicSpace?.id ?? null,
      platformMcpUrl,
      mcpUrl: topicSpaceMcpUrl,
      cursorConfigJson,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "トークンの発行に失敗しました。",
    };
  }
}
