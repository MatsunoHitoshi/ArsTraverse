// import type { JSONContent } from "@tiptap/react";
// import type { Attributes } from "@tiptap/core";

// export class TeiConverter {
//   /**
//    * TipTapのJSONContentをTEI XMLに変換
//    */
//   static toTei(jsonContent: JSONContent): string {
//     return this.convertNode(jsonContent);
//   }

//   /**
//    * TEI XMLをTipTapのJSONContentに変換
//    */
//   static fromTei(teiXml: string): JSONContent {
//     const parser = new DOMParser();
//     const doc = parser.parseFromString(teiXml, "text/xml");

//     // XMLパースエラーチェック
//     const parseError = doc.querySelector("parsererror");
//     if (parseError) {
//       throw new Error("Invalid TEI XML format");
//     }

//     return this.parseTeiElement(doc.documentElement);
//   }

//   /**
//    * ノードをTEI XMLに変換
//    */
//   private static convertNode(node: JSONContent): string {
//     if (!node) return "";

//     // TEI要素の場合
//     if (node.type === "teiElement") {
//       const tagName = `tei-${String(node.attrs?.tag) ?? "p"}`;
//       const attributes: Attributes =
//         (node.attrs as { attributes?: Attributes })?.attributes ?? {};

//       const attrsString = Object.entries(attributes)
//         .filter(([_, value]) => String(value) !== "")
//         .map(([key, value]) => `${key}="${this.escapeXml(String(value))}"`)
//         .join(" ");

//       const children =
//         node.content?.map((child) => this.convertNode(child)).join("") ?? "";

//       return `<${tagName}${attrsString ? " " + attrsString : ""}>${children}</${tagName}>`;
//     }

//     // TEI属性マークの場合
//     if (node.type === "teiAttribute") {
//       const name = String(node.attrs?.name ?? "");
//       const value = String(node.attrs?.value ?? "");
//       const children =
//         node.content?.map((child) => this.convertNode(child)).join("") ?? "";

//       return `<span data-tei-attr="${this.escapeXml(String(name))}" data-tei-value="${this.escapeXml(String(value))}">${children}</span>`;
//     }

//     // 通常のテキストノードの場合
//     if (node.type === "text") {
//       return this.escapeXml(node.text ?? "");
//     }

//     // その他のノードタイプ
//     if (node.content) {
//       return node.content.map((child) => this.convertNode(child)).join("");
//     }

//     return "";
//   }

//   /**
//    * TEI要素をJSONContentに変換
//    */
//   private static parseTeiElement(element: Element): JSONContent {
//     const tagName = element.tagName.replace("tei-", "");

//     // 属性を抽出
//     const attributes: Record<string, string> = {};
//     for (const attr of element.attributes) {
//       if (attr?.name) {
//         attributes[attr.name] = attr?.value ?? "";
//       }
//     }

//     // 子要素を処理
//     const content: JSONContent[] = [];

//     for (const child of element.childNodes) {
//       if (child?.nodeType === Node.TEXT_NODE) {
//         const text = child.textContent?.trim();
//         if (text) {
//           content.push({
//             type: "text",
//             text: text,
//           });
//         }
//       } else if (child?.nodeType === Node.ELEMENT_NODE) {
//         const childElement = child as Element;

//         if (childElement.tagName.startsWith("tei-")) {
//           content.push(this.parseTeiElement(childElement));
//         } else if (
//           childElement.tagName === "span" &&
//           childElement.hasAttribute("data-tei-attr")
//         ) {
//           content.push({
//             type: "teiAttribute",
//             attrs: {
//               name: childElement.getAttribute("data-tei-attr") ?? "",
//               value: childElement.getAttribute("data-tei-value") ?? "",
//             },
//             content: this.parseElementContent(childElement),
//           });
//         } else {
//           // その他の要素は通常のテキストとして処理
//           content.push({
//             type: "text",
//             text: childElement.textContent ?? "",
//           });
//         }
//       }
//     }

//     return {
//       type: "teiElement",
//       attrs: {
//         tag: tagName,
//         attributes,
//       },
//       content: content.length > 0 ? content : undefined,
//     };
//   }

//   /**
//    * 要素の内容を再帰的に解析
//    */
//   private static parseElementContent(element: Element): JSONContent[] {
//     const content: JSONContent[] = [];

//     for (const child of element.childNodes) {
//       if (child?.nodeType === Node.TEXT_NODE) {
//         const text = child.textContent?.trim();
//         if (text) {
//           content.push({
//             type: "text",
//             text: text,
//           });
//         }
//       } else if (child?.nodeType === Node.ELEMENT_NODE) {
//         const childElement = child as Element;

//         if (childElement.tagName.startsWith("tei-")) {
//           content.push(this.parseTeiElement(childElement));
//         } else if (
//           childElement.tagName === "span" &&
//           childElement.hasAttribute("data-tei-attr")
//         ) {
//           content.push({
//             type: "teiAttribute",
//             attrs: {
//               name: childElement.getAttribute("data-tei-attr") ?? "",
//               value: childElement.getAttribute("data-tei-value") ?? "",
//             },
//             content: this.parseElementContent(childElement),
//           });
//         } else {
//           content.push({
//             type: "text",
//             text: childElement.textContent ?? "",
//           });
//         }
//       }
//     }

//     return content;
//   }

//   /**
//    * XML特殊文字をエスケープ
//    */
//   private static escapeXml(text: string): string {
//     return text
//       .replace(/&/g, "&amp;")
//       .replace(/</g, "&lt;")
//       .replace(/>/g, "&gt;")
//       .replace(/"/g, "&quot;")
//       .replace(/'/g, "&#39;");
//   }

//   /**
//    * XML特殊文字のエスケープを解除
//    */
//   private static unescapeXml(text: string): string {
//     return text
//       .replace(/&amp;/g, "&")
//       .replace(/&lt;/g, "<")
//       .replace(/&gt;/g, ">")
//       .replace(/&quot;/g, '"')
//       .replace(/&#39;/g, "'");
//   }

//   /**
//    * TEI XMLのバリデーション
//    */
//   static validateTeiXml(teiXml: string): {
//     isValid: boolean;
//     errors: string[];
//   } {
//     const errors: string[] = [];

//     try {
//       const parser = new DOMParser();
//       const doc = parser.parseFromString(teiXml, "text/xml");

//       // XMLパースエラーチェック
//       const parseError = doc.querySelector("parsererror");
//       if (parseError) {
//         errors.push("Invalid XML format");
//         return { isValid: false, errors };
//       }

//       // 基本的なTEI構造チェック
//       const teiElements = doc.querySelectorAll('[class*="tei-"], [id*="tei-"]');
//       if (teiElements.length === 0) {
//         errors.push("No TEI elements found");
//       }

//       // ネストされた要素のチェック
//       const allElements = doc.querySelectorAll("*");
//       for (const element of allElements) {
//         const tagName = element?.tagName;

//         if (tagName?.startsWith("tei-")) {
//           // 閉じタグの存在チェック
//           const openTags = teiXml.split(`<${tagName}`).length - 1;
//           const closeTags = teiXml.split(`</${tagName}>`).length - 1;

//           if (openTags !== closeTags) {
//             errors.push(`Unclosed tag: ${tagName}`);
//           }
//         }
//       }
//     } catch (error) {
//       errors.push(
//         `Parse error: ${error instanceof Error ? error.message : "Unknown error"}`,
//       );
//     }

//     return {
//       isValid: errors.length === 0,
//       errors,
//     };
//   }

//   /**
//    * TEI XMLを整形
//    */
//   static formatTeiXml(teiXml: string): string {
//     try {
//       const parser = new DOMParser();
//       const doc = parser.parseFromString(teiXml, "text/xml");

//       // パースエラーチェック
//       const parseError = doc.querySelector("parsererror");
//       if (parseError) {
//         return teiXml; // エラーの場合は元の文字列を返す
//       }

//       // 簡単な整形（実際の実装ではより高度な整形が必要）
//       return new XMLSerializer()
//         .serializeToString(doc)
//         .replace(/></g, ">\n<")
//         .split("\n")
//         .map((line, _index) => {
//           const depth =
//             (line.match(/</g) ?? []).length - (line.match(/<\//g) ?? []).length;
//           return "  ".repeat(Math.max(0, depth)) + line.trim();
//         })
//         .join("\n");
//     } catch (error) {
//       return teiXml; // エラーの場合は元の文字列を返す
//     }
//   }
// }
