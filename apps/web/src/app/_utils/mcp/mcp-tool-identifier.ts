/**
 * TopicSpace 用 MCP ツール名サフィックス（`_*_in_{identifier}`）を決定する。
 */
export function slugifyMcpToolIdentifier(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return slug.length > 0 ? slug : "topic_space";
}

export function deriveMcpToolIdentifierFromTopicSpaceId(topicSpaceId: string): string {
  const compact = topicSpaceId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `ts_${compact.slice(0, 12)}`;
}

export function resolveMcpToolIdentifier(
  topicSpaceId: string,
  storedIdentifier: string | null | undefined,
): string {
  const trimmed = storedIdentifier?.trim();
  if (trimmed) {
    return trimmed.toLowerCase();
  }
  return deriveMcpToolIdentifierFromTopicSpaceId(topicSpaceId);
}
