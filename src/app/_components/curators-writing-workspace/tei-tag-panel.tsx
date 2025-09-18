// import React, { useState, useCallback } from "react";
// import type { Editor } from "@tiptap/react";
// import { TeiTagManager, type TeiTagDefinition } from "./tei-extensions";

// interface TeiTagPanelProps {
//   editor: Editor;
//   isOpen: boolean;
//   onClose: () => void;
// }

// export const TeiTagPanel: React.FC<TeiTagPanelProps> = ({
//   editor,
//   isOpen,
//   onClose,
// }) => {
//   const [selectedTag, setSelectedTag] = useState<string>("");
//   const [attributes, setAttributes] = useState<Record<string, string>>({});
//   const [selectedCategory, setSelectedCategory] = useState<string>("all");

//   const categories = [
//     { value: "all", label: "All Tags" },
//     { value: "structural", label: "Structural" },
//     { value: "semantic", label: "Semantic" },
//     { value: "metadata", label: "Metadata" },
//     { value: "formatting", label: "Formatting" },
//   ];

//   const filteredTags =
//     selectedCategory === "all"
//       ? TeiTagManager.getAvailableTags()
//       : TeiTagManager.getTagsByCategory(
//           selectedCategory as TeiTagDefinition["category"],
//         );

//   const selectedTagDefinition = selectedTag
//     ? TeiTagManager.getTag(selectedTag)
//     : null;

//   const handleTagSelect = useCallback((tagName: string) => {
//     setSelectedTag(tagName);
//     setAttributes({});
//   }, []);

//   const handleAttributeChange = useCallback((key: string, value: string) => {
//     setAttributes((prev) => ({
//       ...prev,
//       [key]: value,
//     }));
//   }, []);

//   const removeAttribute = useCallback((key: string) => {
//     setAttributes((prev) => {
//       const newAttrs = { ...prev };
//       delete newAttrs[key];
//       return newAttrs;
//     });
//   }, []);

//   const addAttribute = useCallback(() => {
//     const key = prompt("Attribute name:");
//     if (key && selectedTagDefinition?.allowedAttributes.includes(key)) {
//       handleAttributeChange(key, "");
//     } else if (key) {
//       alert(
//         `Invalid attribute '${key}' for tag '${selectedTag}'. Allowed attributes: ${selectedTagDefinition?.allowedAttributes.join(", ")}`,
//       );
//     }
//   }, [selectedTag, selectedTagDefinition, handleAttributeChange]);

//   const insertTeiTag = useCallback(() => {
//     if (!selectedTag) return;

//     const errors = TeiTagManager.validateAttributes(selectedTag, attributes);
//     if (errors.length > 0) {
//       alert(errors.join("\n"));
//       return;
//     }

//     editor
//       .chain()
//       .focus()
//       .insertContent({
//         type: "teiElement",
//         attrs: {
//           tag: selectedTag,
//           attributes,
//         },
//       })
//       .run();

//     // リセット
//     setSelectedTag("");
//     setAttributes({});
//     onClose();
//   }, [selectedTag, attributes, editor, onClose]);

//   if (!isOpen) return null;

//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
//       <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
//         <div className="flex items-center justify-between border-b p-4">
//           <h2 className="text-xl font-semibold">Insert TEI Tag</h2>
//           <button
//             onClick={onClose}
//             className="text-2xl text-gray-500 hover:text-gray-700"
//           >
//             ×
//           </button>
//         </div>

//         <div className="max-h-[60vh] overflow-y-auto p-4">
//           {/* カテゴリフィルター */}
//           <div className="mb-4">
//             <label className="mb-2 block text-sm font-medium text-gray-700">
//               Category
//             </label>
//             <select
//               value={selectedCategory}
//               onChange={(e) => setSelectedCategory(e.target.value)}
//               className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
//             >
//               {categories.map((category) => (
//                 <option key={category.value} value={category.value}>
//                   {category.label}
//                 </option>
//               ))}
//             </select>
//           </div>

//           {/* タグ選択 */}
//           <div className="mb-4">
//             <label className="mb-2 block text-sm font-medium text-gray-700">
//               TEI Tag
//             </label>
//             <select
//               value={selectedTag}
//               onChange={(e) => handleTagSelect(e.target.value)}
//               className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
//             >
//               <option value="">Select a TEI tag</option>
//               {filteredTags.map((tag) => (
//                 <option key={tag.name} value={tag.name}>
//                   {tag.displayName} ({tag.name})
//                 </option>
//               ))}
//             </select>
//             {selectedTagDefinition && (
//               <p className="mt-1 text-sm text-gray-600">
//                 {selectedTagDefinition.description}
//               </p>
//             )}
//           </div>

//           {/* 属性設定 */}
//           {selectedTagDefinition && (
//             <div className="mb-4">
//               <label className="mb-2 block text-sm font-medium text-gray-700">
//                 Attributes
//               </label>
//               <div className="space-y-2">
//                 {Object.entries(attributes).map(([key, value]) => (
//                   <div key={key} className="flex items-center space-x-2">
//                     <input
//                       type="text"
//                       value={key}
//                       disabled
//                       className="flex-1 rounded-md border border-gray-300 bg-gray-100 p-2"
//                     />
//                     <span className="text-gray-500">:</span>
//                     <input
//                       type="text"
//                       value={value}
//                       onChange={(e) =>
//                         handleAttributeChange(key, e.target.value)
//                       }
//                       placeholder="value"
//                       className="flex-1 rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
//                     />
//                     <button
//                       onClick={() => removeAttribute(key)}
//                       className="p-1 text-red-500 hover:text-red-700"
//                       title="Remove attribute"
//                     >
//                       ×
//                     </button>
//                   </div>
//                 ))}
//                 {selectedTagDefinition.allowedAttributes.length > 0 && (
//                   <button
//                     onClick={addAttribute}
//                     className="text-sm text-blue-500 hover:text-blue-700"
//                   >
//                     + Add Attribute
//                   </button>
//                 )}
//                 {selectedTagDefinition.allowedAttributes.length === 0 && (
//                   <p className="text-sm text-gray-500">
//                     No attributes available for this tag
//                   </p>
//                 )}
//               </div>
//             </div>
//           )}

//           {/* プレビュー */}
//           {selectedTag && (
//             <div className="mb-4">
//               <label className="mb-2 block text-sm font-medium text-gray-700">
//                 Preview
//               </label>
//               <div className="rounded-md bg-gray-100 p-3 font-mono text-sm">
//                 <div>
//                   &lt;tei-{selectedTag}
//                   {Object.entries(attributes)
//                     .map(([key, value]) => (value ? ` ${key}="${value}"` : ""))
//                     .join("")}
//                   &gt;
//                 </div>
//                 <div className="ml-2 text-gray-500">content...</div>
//                 <div>&lt;/tei-{selectedTag}&gt;</div>
//               </div>
//             </div>
//           )}
//         </div>

//         {/* アクションボタン */}
//         <div className="flex items-center justify-end space-x-2 border-t bg-gray-50 p-4">
//           <button
//             onClick={onClose}
//             className="px-4 py-2 text-gray-600 hover:text-gray-800"
//           >
//             Cancel
//           </button>
//           <button
//             onClick={insertTeiTag}
//             disabled={!selectedTag}
//             className="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300"
//           >
//             Insert Tag
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// // ツールバーボタンコンポーネント
// export const TeiTagButton: React.FC<{ editor: Editor }> = ({ editor }) => {
//   const [isPanelOpen, setIsPanelOpen] = useState(false);

//   return (
//     <>
//       <button
//         onClick={() => setIsPanelOpen(true)}
//         className="rounded-md bg-purple-100 px-3 py-1 text-sm text-purple-700 hover:bg-purple-200"
//         title="Insert TEI Tag"
//       >
//         TEI
//       </button>
//       <TeiTagPanel
//         editor={editor}
//         isOpen={isPanelOpen}
//         onClose={() => setIsPanelOpen(false)}
//       />
//     </>
//   );
// };
