import type { NodeTypeForFrontend } from "@/app/const/types";

/** 日本語・CJK を含む語は部分一致、ASCII ラテン語のみは単語境界 + 大文字小文字無視 */
function containsJapaneseOrNonAscii(term: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(term) || /[^\x00-\x7F]/.test(term);
}

export function termAppearsInChunk(term: string, chunkText: string): boolean {
  const trimmed = term.trim();
  if (!trimmed) return false;

  if (containsJapaneseOrNonAscii(trimmed)) {
    return chunkText.includes(trimmed);
  }

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(chunkText);
}

function nodeAppearsInChunk(
  node: NodeTypeForFrontend,
  chunkText: string,
): boolean {
  if (termAppearsInChunk(node.name, chunkText)) return true;

  const ja = node.properties?.name_ja?.trim();
  if (ja && termAppearsInChunk(ja, chunkText)) return true;

  const en = node.properties?.name_en?.trim();
  if (en && en !== node.name && termAppearsInChunk(en, chunkText)) return true;

  return false;
}

export function filterNodesForChunk(
  chunkText: string,
  nodes: NodeTypeForFrontend[],
): NodeTypeForFrontend[] {
  return nodes.filter((node) => nodeAppearsInChunk(node, chunkText));
}

export function buildLocalContextFromNodes(
  chunkText: string,
  nodes: NodeTypeForFrontend[],
): string {
  return filterNodesForChunk(chunkText, nodes)
    .map((n) => {
      const ja = n.properties?.name_ja ? `(${n.properties.name_ja})` : "";
      return `- ${n.name} [${n.label}] ${ja}`;
    })
    .join("\n");
}
