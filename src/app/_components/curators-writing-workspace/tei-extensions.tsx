// import { Node, Mark, type Attributes } from "@tiptap/core";
// import { ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
// import { NodeViewWrapper } from "@tiptap/react";
// import React from "react";

// // TEI要素用のカスタムノード
// export const TeiElement = Node.create({
//   name: "teiElement",
//   group: "block",
//   content: "inline*",
//   addAttributes() {
//     return {
//       tag: {
//         default: "p",
//         parseHTML: (element) => element.getAttribute("data-tei-tag") ?? "p",
//         renderHTML: (attributes: Attributes) => {
//           if (!attributes.tag) return {};
//           return { "data-tei-tag": attributes.tag };
//         },
//       },
//       attributes: {
//         default: {},
//         parseHTML: (element) => {
//           const attrs: Record<string, string> = {};
//           for (const attr of element.attributes) {
//             if (attr.name.startsWith("data-tei-attr-")) {
//               attrs[attr.name.replace("data-tei-attr-", "")] = attr.value;
//             }
//           }
//           return attrs;
//         },
//         renderHTML: (attributes: Attributes) => {
//           const result: Record<string, string> = {};
//           Object.entries(attributes.attributes ?? {}).forEach(
//             ([key, value]) => {
//               result[`data-tei-attr-${key}`] = value as string;
//             },
//           );
//           return result;
//         },
//       },
//     };
//   },
//   parseHTML() {
//     return [
//       { tag: "tei-p" },
//       { tag: "tei-head" },
//       { tag: "tei-div" },
//       { tag: "tei-list" },
//       { tag: "tei-item" },
//       { tag: "tei-quote" },
//       { tag: "tei-cite" },
//       { tag: "tei-note" },
//       { tag: "tei-title" },
//       { tag: "tei-author" },
//       { tag: "tei-date" },
//       { tag: "tei-place" },
//       { tag: "tei-person" },
//       { tag: "tei-org" },
//       { tag: "tei-work" },
//       { tag: "tei-bibl" },
//       { tag: "tei-ref" },
//       { tag: "tei-link" },
//       { tag: "tei-figure" },
//       { tag: "tei-table" },
//       { tag: "tei-row" },
//       { tag: "tei-cell" },
//       { tag: "pers-name" },
//     ];
//   },
//   renderHTML({ node, HTMLAttributes }) {
//     const tagName = `tei-${node.attrs.tag}`;
//     const attributes = {
//       ...HTMLAttributes,
//       ...node.attrs.attributes,
//     } as Attributes;

//     return [tagName, attributes, 0];
//   },
//   addNodeView() {
//     return ReactNodeViewRenderer(TeiElementView);
//   },
// });

// // TEI属性用のマーク
// export const TeiAttribute = Mark.create({
//   name: "teiAttribute",
//   addAttributes() {
//     return {
//       name: {
//         default: "",
//         parseHTML: (element) => element.getAttribute("data-tei-attr") ?? "",
//         renderHTML: (attributes: Attributes) => {
//           if (!attributes.name) return {};
//           return { "data-tei-attr": attributes.name };
//         },
//       },
//       value: {
//         default: "",
//         parseHTML: (element) => element.getAttribute("data-tei-value") ?? "",
//         renderHTML: (attributes: Attributes) => {
//           if (!attributes.value) return {};
//           return { "data-tei-value": attributes.value };
//         },
//       },
//     };
//   },
//   parseHTML() {
//     return [
//       {
//         tag: "span[data-tei-attr]",
//         getAttrs: (element: Element) => ({
//           name: element.getAttribute("data-tei-attr"),
//           value: element.getAttribute("data-tei-value"),
//         }),
//       },
//     ];
//   },
//   renderHTML({ mark, HTMLAttributes }) {
//     return [
//       "span",
//       {
//         ...HTMLAttributes,
//         "data-tei-attr": mark.attrs.name,
//         "data-tei-value": mark.attrs.value,
//         class: "tei-attribute",
//       },
//       0,
//     ];
//   },
// });

// // TEI要素のビューコンポーネント
// const TeiElementView: React.FC<ReactNodeViewProps> = ({
//   node,
//   updateAttributes,
//   deleteNode,
// }) => {
//   const { tag, attributes } = node.attrs;

//   const handleAttributeChange = (key: string, value: string) => {
//     const newAttributes = { ...attributes, [key]: value };
//     updateAttributes({ attributes: newAttributes });
//   };

//   const removeAttribute = (key: string) => {
//     const newAttributes = { ...attributes };
//     delete newAttributes[key];
//     updateAttributes({ attributes: newAttributes });
//   };

//   return (
//     <NodeViewWrapper className="tei-element-wrapper">
//       <div className="tei-element" data-tei-tag={tag}>
//         <div className="tei-element-header">
//           <span className="tei-tag-name">{`<tei-${tag}>`}</span>
//           <button
//             className="tei-remove-btn"
//             onClick={deleteNode}
//             title="Remove TEI element"
//           >
//             ×
//           </button>
//         </div>

//         <div className="tei-element-content">
//           <div className="tei-attributes">
//             {Object.entries(attributes).map(([key, value]) => (
//               <div key={key} className="tei-attribute-item">
//                 <span className="tei-attr-key">{key}:</span>
//                 <input
//                   type="text"
//                   value={value as string}
//                   onChange={(e) => handleAttributeChange(key, e.target.value)}
//                   className="tei-attr-value"
//                 />
//                 <button
//                   onClick={() => removeAttribute(key)}
//                   className="tei-attr-remove"
//                   title="Remove attribute"
//                 >
//                   ×
//                 </button>
//               </div>
//             ))}
//             <button
//               className="tei-add-attr-btn"
//               onClick={() => {
//                 const key = prompt("Attribute name:");
//                 if (key) {
//                   handleAttributeChange(key, "");
//                 }
//               }}
//               title="Add attribute"
//             >
//               + Add Attribute
//             </button>
//           </div>

//           <div className="tei-content">
//             {/* ここにTipTapのコンテンツがレンダリングされる */}
//           </div>
//         </div>

//         <div className="tei-element-footer">
//           <span className="tei-tag-name">{`</tei-${tag}>`}</span>
//         </div>
//       </div>
//     </NodeViewWrapper>
//   );
// };

// // TEIタグ定義
// export interface TeiTagDefinition {
//   name: string;
//   displayName: string;
//   category: "structural" | "semantic" | "formatting" | "metadata";
//   allowedAttributes: string[];
//   allowedChildren: string[];
//   isInline: boolean;
//   description: string;
// }

// // 主要なTEIタグの定義
// export const TEI_TAGS: TeiTagDefinition[] = [
//   // 構造的要素
//   {
//     name: "p",
//     displayName: "Paragraph",
//     category: "structural",
//     allowedAttributes: ["n", "rend", "type"],
//     allowedChildren: ["hi", "note", "ref", "link"],
//     isInline: false,
//     description: "A paragraph of text",
//   },
//   {
//     name: "head",
//     displayName: "Heading",
//     category: "structural",
//     allowedAttributes: ["type", "rend", "n"],
//     allowedChildren: ["hi", "ref"],
//     isInline: false,
//     description: "A heading or title",
//   },
//   {
//     name: "div",
//     displayName: "Division",
//     category: "structural",
//     allowedAttributes: ["type", "n", "rend"],
//     allowedChildren: ["head", "p", "div", "list", "quote"],
//     isInline: false,
//     description: "A structural division of text",
//   },
//   {
//     name: "list",
//     displayName: "List",
//     category: "structural",
//     allowedAttributes: ["type", "rend"],
//     allowedChildren: ["item"],
//     isInline: false,
//     description: "A list of items",
//   },
//   {
//     name: "item",
//     displayName: "List Item",
//     category: "structural",
//     allowedAttributes: ["n", "rend"],
//     allowedChildren: ["p", "hi", "ref"],
//     isInline: false,
//     description: "An item in a list",
//   },

//   // 意味的要素
//   {
//     name: "quote",
//     displayName: "Quote",
//     category: "semantic",
//     allowedAttributes: ["type", "rend", "source"],
//     allowedChildren: ["p", "hi", "ref"],
//     isInline: false,
//     description: "A quotation from another source",
//   },
//   {
//     name: "cite",
//     displayName: "Citation",
//     category: "semantic",
//     allowedAttributes: ["type", "rend"],
//     allowedChildren: ["hi", "ref"],
//     isInline: true,
//     description: "A citation or reference",
//   },
//   {
//     name: "note",
//     displayName: "Note",
//     category: "semantic",
//     allowedAttributes: ["type", "place", "n"],
//     allowedChildren: ["p", "hi", "ref"],
//     isInline: false,
//     description: "A note or annotation",
//   },

//   // メタデータ要素
//   {
//     name: "title",
//     displayName: "Title",
//     category: "metadata",
//     allowedAttributes: ["type", "level"],
//     allowedChildren: ["hi", "ref"],
//     isInline: true,
//     description: "A title of a work",
//   },
//   {
//     name: "author",
//     displayName: "Author",
//     category: "metadata",
//     allowedAttributes: ["type", "role"],
//     allowedChildren: ["hi", "ref"],
//     isInline: true,
//     description: "An author or creator",
//   },
//   {
//     name: "date",
//     displayName: "Date",
//     category: "metadata",
//     allowedAttributes: ["when", "from", "to", "type"],
//     allowedChildren: ["hi"],
//     isInline: true,
//     description: "A date or time period",
//   },
//   {
//     name: "place",
//     displayName: "Place",
//     category: "metadata",
//     allowedAttributes: ["type", "ref"],
//     allowedChildren: ["hi", "ref"],
//     isInline: true,
//     description: "A geographical place",
//   },
//   {
//     name: "person",
//     displayName: "Person",
//     category: "metadata",
//     allowedAttributes: ["type", "ref", "role"],
//     allowedChildren: ["hi", "ref"],
//     isInline: true,
//     description: "A person",
//   },
//   {
//     name: "org",
//     displayName: "Organization",
//     category: "metadata",
//     allowedAttributes: ["type", "ref"],
//     allowedChildren: ["hi", "ref"],
//     isInline: true,
//     description: "An organization or institution",
//   },

//   // 書誌要素
//   {
//     name: "work",
//     displayName: "Work",
//     category: "metadata",
//     allowedAttributes: ["type", "ref"],
//     allowedChildren: ["title", "author", "date"],
//     isInline: true,
//     description: "A work or publication",
//   },
//   {
//     name: "bibl",
//     displayName: "Bibliographic Reference",
//     category: "metadata",
//     allowedAttributes: ["type", "rend"],
//     allowedChildren: ["title", "author", "date", "work"],
//     isInline: false,
//     description: "A bibliographic reference",
//   },
//   {
//     name: "ref",
//     displayName: "Reference",
//     category: "semantic",
//     allowedAttributes: ["target", "type"],
//     allowedChildren: ["hi"],
//     isInline: true,
//     description: "A reference to another element",
//   },
//   {
//     name: "link",
//     displayName: "Link",
//     category: "semantic",
//     allowedAttributes: ["target", "type", "rend"],
//     allowedChildren: ["hi"],
//     isInline: true,
//     description: "A hyperlink",
//   },

//   // フォーマット要素
//   {
//     name: "hi",
//     displayName: "Highlight",
//     category: "formatting",
//     allowedAttributes: ["rend", "type"],
//     allowedChildren: [],
//     isInline: true,
//     description: "Highlighted or emphasized text",
//   },

//   // 表・図要素
//   {
//     name: "figure",
//     displayName: "Figure",
//     category: "structural",
//     allowedAttributes: ["type", "rend", "n"],
//     allowedChildren: ["head", "p"],
//     isInline: false,
//     description: "A figure or illustration",
//   },
//   {
//     name: "table",
//     displayName: "Table",
//     category: "structural",
//     allowedAttributes: ["type", "rend", "n"],
//     allowedChildren: ["row"],
//     isInline: false,
//     description: "A table",
//   },
//   {
//     name: "row",
//     displayName: "Table Row",
//     category: "structural",
//     allowedAttributes: ["type", "rend"],
//     allowedChildren: ["cell"],
//     isInline: false,
//     description: "A table row",
//   },
//   {
//     name: "cell",
//     displayName: "Table Cell",
//     category: "structural",
//     allowedAttributes: ["type", "rend", "cols", "rows"],
//     allowedChildren: ["p", "hi", "ref"],
//     isInline: false,
//     description: "A table cell",
//   },
// ];

// // TEIタグマネージャー
// export class TeiTagManager {
//   private static tags = new Map<string, TeiTagDefinition>(
//     TEI_TAGS.map((tag) => [tag.name, tag]),
//   );

//   static getAvailableTags(): TeiTagDefinition[] {
//     return Array.from(this.tags.values());
//   }

//   static getTag(tagName: string): TeiTagDefinition | undefined {
//     return this.tags.get(tagName);
//   }

//   static getTagsByCategory(
//     category: TeiTagDefinition["category"],
//   ): TeiTagDefinition[] {
//     return this.getAvailableTags().filter((tag) => tag.category === category);
//   }

//   static createTeiNode(
//     tagName: string,
//     attributes: Record<string, string> = {},
//   ) {
//     const definition = this.getTag(tagName);
//     if (!definition) {
//       throw new Error(`Unknown TEI tag: ${tagName}`);
//     }

//     return {
//       type: "teiElement",
//       attrs: {
//         tag: tagName,
//         attributes,
//       },
//     };
//   }

//   static validateAttributes(
//     tagName: string,
//     attributes: Record<string, string>,
//   ): string[] {
//     const definition = this.getTag(tagName);
//     if (!definition) return [`Unknown tag: ${tagName}`];

//     const errors: string[] = [];
//     Object.keys(attributes).forEach((attr) => {
//       if (!definition.allowedAttributes.includes(attr)) {
//         errors.push(`Invalid attribute '${attr}' for tag '${tagName}'`);
//       }
//     });

//     return errors;
//   }
// }
