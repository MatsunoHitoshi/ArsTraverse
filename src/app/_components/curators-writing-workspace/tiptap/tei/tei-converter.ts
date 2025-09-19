import type { JSONContent } from "@tiptap/react";
import type { Attributes, HTMLContent } from "@tiptap/core";

export class TeiConverter {
  static toTeiBody(HTMLContent: string | undefined, withClass = false): string {
    const html = !withClass
      ? this.removeClass(HTMLContent ?? "")
      : HTMLContent ?? "";
    const persNameConvertedHTML = this.convertCustomTag(
      html ?? "",
      "pers-name",
    );
    const body = `<body>${persNameConvertedHTML}</body>`;
    return body;
  }

  private static removeClass(html: string): string {
    return html.replace(/\s*class="[^"]*"/g, "");
  }

  /**
   * ケバブケースをキャメルケースに変換
   * 例: "pers-name" -> "persName", "my-custom-tag" -> "myCustomTag"
   */
  private static kebabToCamelCase(kebabCase: string): string {
    return kebabCase.replace(/-([a-z])/g, (_, letter: string) =>
      letter.toUpperCase(),
    );
  }

  /**
   * spanタグをcustomTagタグに変換
   */
  private static convertCustomTag(html: string, tagName: string): string {
    return html.replace(
      new RegExp(
        `<span([^>]*data-${tagName}="([^"]*)"[^>]*)>(.*?)</span>`,
        "g",
      ),
      (match: string, attrs: string, content: string) => {
        // 既存のref属性を優先的に使用
        const existingRefMatch: RegExpMatchArray | null =
          attrs.match(/ref="([^"]*)"/);
        const tagNameCamelCase: string = this.kebabToCamelCase(tagName);

        if (existingRefMatch) {
          return `<${tagNameCamelCase} ref="${existingRefMatch[1]}">${content}</${tagNameCamelCase}>`;
        }
        // ref属性がない場合はdata-entity-nameから抽出
        const refMatch = attrs.match(/data-entity-name="([^"]*)"/);
        const ref = refMatch ? refMatch[1] : "";

        return `<${tagNameCamelCase} ref="${ref}">${content}</${tagNameCamelCase}>`;
      },
    );
  }

  /**
   * XML特殊文字をエスケープ
   */
  private static escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * XML特殊文字のエスケープを解除
   */
  private static unescapeXml(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  /**
   * TEI XMLのバリデーション
   */
  static validateTeiXml(teiXml: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(teiXml, "text/xml");

      // XMLパースエラーチェック
      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        errors.push("Invalid XML format");
        return { isValid: false, errors };
      }

      // 基本的なTEI構造チェック
      const teiElements = doc.querySelectorAll('[class*="tei-"], [id*="tei-"]');
      if (teiElements.length === 0) {
        errors.push("No TEI elements found");
      }

      // ネストされた要素のチェック
      const allElements = doc.querySelectorAll("*");
      for (const element of allElements) {
        const tagName = element?.tagName;

        if (tagName?.startsWith("tei-")) {
          // 閉じタグの存在チェック
          const openTags = teiXml.split(`<${tagName}`).length - 1;
          const closeTags = teiXml.split(`</${tagName}>`).length - 1;

          if (openTags !== closeTags) {
            errors.push(`Unclosed tag: ${tagName}`);
          }
        }
      }
    } catch (error) {
      errors.push(
        `Parse error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * TEI XMLを整形
   */
  static formatTeiXml(teiXml: string): string {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(teiXml, "text/xml");

      // パースエラーチェック
      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        return teiXml; // エラーの場合は元の文字列を返す
      }

      // 簡単な整形（実際の実装ではより高度な整形が必要）
      return new XMLSerializer()
        .serializeToString(doc)
        .replace(/></g, ">\n<")
        .split("\n")
        .map((line, _index) => {
          const depth =
            (line.match(/</g) ?? []).length - (line.match(/<\//g) ?? []).length;
          return "  ".repeat(Math.max(0, depth)) + line.trim();
        })
        .join("\n");
    } catch (error) {
      return teiXml; // エラーの場合は元の文字列を返す
    }
  }
}
