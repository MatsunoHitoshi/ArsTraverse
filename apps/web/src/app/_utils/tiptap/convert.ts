import type { JsonValue } from "@prisma/client/runtime/library";

/**
 * JSONコンテンツをテキストに変換
 */
export const convertJsonToText = (content: JsonValue): string => {
  if (typeof content === "object" && content !== null) {
    // TipTapのJSON形式の場合
    if ("type" in content && content.type === "doc" && "content" in content) {
      return extractTextFromTipTap(content);
    }

    // その他のJSON形式
    return JSON.stringify(content);
  }

  return String(content);
};

/**
 * TipTapのJSONからテキストを抽出
 */
const extractTextFromTipTap = (content: JsonValue): string => {
  let text = "";

  // オブジェクトの場合
  if (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content)
  ) {
    // textプロパティがある場合は追加
    if ("text" in content && typeof content.text === "string") {
      text += content.text;
    }

    // contentプロパティがある場合は再帰的に処理
    if ("content" in content && Array.isArray(content.content)) {
      for (const child of content.content) {
        if (child !== null) {
          text += extractTextFromTipTap(child);
        }
      }
    }
  }

  // 配列の場合
  if (Array.isArray(content)) {
    for (const child of content) {
      if (child !== null) {
        text += extractTextFromTipTap(child);
      }
    }
  }

  return text;
};
