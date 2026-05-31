import type { JSONContent } from "@tiptap/core";

function getTextFromNodeContent(content: JSONContent["content"]): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (c.type === "text" && c.text) return c.text;
      if (c.content) return getTextFromNodeContent(c.content);
      return "";
    })
    .join("");
}

/**
 * TipTap の doc.content 配列からプレーンテキストを抽出する。
 * 見出し・段落ごとに改行で区切って連結する。
 */
export function getPlainTextFromTipTapContent(
  content: JSONContent[] | undefined,
): string {
  if (!Array.isArray(content) || content.length === 0) return "";
  const parts: string[] = [];
  for (const node of content) {
    if (node.type === "heading" || node.type === "paragraph") {
      const text = getTextFromNodeContent(node.content).trim();
      if (text) parts.push(text);
    } else if (node.content) {
      const nested = getPlainTextFromTipTapContent(node.content);
      if (nested) parts.push(nested);
    }
  }
  return parts.join("\n\n");
}
