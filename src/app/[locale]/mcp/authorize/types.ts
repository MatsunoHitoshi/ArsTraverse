export const PLATFORM_MCP_SCOPE = "__platform__";

export type IssueMcpTokenResult =
  | {
      ok: true;
      token: string;
      expiresAt: string;
      clientName: string;
      scope: "platform" | "topic_space";
      topicSpaceId: string | null;
      platformMcpUrl: string;
      mcpUrl: string | null;
      cursorConfigJson: string;
    }
  | { ok: false; error: string };

export function resolveInitialScopeSelection(
  initialTopicSpaceId: string,
  topicSpaceIds: readonly string[],
): string {
  if (
    initialTopicSpaceId &&
    initialTopicSpaceId !== PLATFORM_MCP_SCOPE
  ) {
    return initialTopicSpaceId;
  }

  return topicSpaceIds[0] ?? PLATFORM_MCP_SCOPE;
}
