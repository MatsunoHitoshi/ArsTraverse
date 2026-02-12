/**
 * TipTap JSON コンテンツからプレーンテキストを抽出する
 * メタデータ（description等）生成用
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractTextFromTiptap(node: any, maxLength = 200): string {
  if (!node) return "";

  const parts: string[] = [];

  function walk(n: unknown): void {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;

    if (obj.type === "text" && typeof obj.text === "string") {
      parts.push(obj.text);
    }

    if (Array.isArray(obj.content)) {
      for (const child of obj.content) {
        walk(child);
      }
    }
  }

  walk(node);

  const fullText = parts.join(" ").replace(/\s+/g, " ").trim();
  if (fullText.length <= maxLength) return fullText;
  return fullText.slice(0, maxLength) + "…";
}
