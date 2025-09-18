// import React, { useState } from "react";
// import type { Editor } from "@tiptap/react";

// interface PersNameButtonProps {
//   editor: Editor;
// }

// export const PersNameButton: React.FC<PersNameButtonProps> = ({ editor }) => {
//   const [isModalOpen, setIsModalOpen] = useState(false);
//   const [ref, setRef] = useState("");

//   const insertPersName = () => {
//     if (!editor) return;

//     const selectedText = editor.state.doc.textBetween(
//       editor.state.selection.from,
//       editor.state.selection.to,
//     );

//     if (selectedText.trim()) {
//       // 選択されたテキストがある場合、それをPersNameで囲む
//       editor
//         .chain()
//         .focus()
//         .insertContent({
//           type: "persName",
//           attrs: { ref },
//           content: [{ type: "text", text: selectedText }],
//         })
//         .run();
//     } else {
//       // 選択されたテキストがない場合、プレースホルダーを挿入
//       editor
//         .chain()
//         .focus()
//         .insertContent({
//           type: "persName",
//           attrs: { ref },
//           content: [{ type: "text", text: "人物名" }],
//         })
//         .run();
//     }

//     // リセット
//     setRef("");
//     setIsModalOpen(false);
//   };

//   return (
//     <>
//       <button
//         onClick={() => setIsModalOpen(true)}
//         className="rounded-md bg-blue-100 px-3 py-1 text-sm text-blue-700 hover:bg-blue-200"
//         title="Insert Person Name"
//       >
//         Person
//       </button>

//       {isModalOpen && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
//           <div className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl">
//             <div className="flex items-center justify-between border-b p-4">
//               <h2 className="text-lg font-semibold">Insert Person Name</h2>
//               <button
//                 onClick={() => setIsModalOpen(false)}
//                 className="text-2xl text-gray-500 hover:text-gray-700"
//               >
//                 ×
//               </button>
//             </div>

//             <div className="p-4">
//               <div className="mb-4">
//                 <label className="mb-2 block text-sm font-medium text-gray-700">
//                   Reference ID (optional)
//                 </label>
//                 <input
//                   type="text"
//                   value={ref}
//                   onChange={(e) => setRef(e.target.value)}
//                   placeholder="e.g., person001"
//                   className="w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
//                 />
//               </div>

//               <div className="mb-4">
//                 <p className="text-sm text-gray-600">
//                   {editor.state.selection.empty
//                     ? "No text selected. A placeholder will be inserted."
//                     : `Selected text: "${editor.state.doc.textBetween(
//                         editor.state.selection.from,
//                         editor.state.selection.to,
//                       )}"`}
//                 </p>
//               </div>
//             </div>

//             <div className="flex items-center justify-end space-x-2 border-t bg-gray-50 p-4">
//               <button
//                 onClick={() => setIsModalOpen(false)}
//                 className="rounded-md bg-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-400"
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={insertPersName}
//                 className="rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
//               >
//                 Insert
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </>
//   );
// };
