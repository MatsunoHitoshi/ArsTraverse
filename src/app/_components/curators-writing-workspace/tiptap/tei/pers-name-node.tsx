// import { Command, Commands, Editor, Node, type Attributes } from "@tiptap/core";
// import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";

// const PersNameNode = () => {
//   return (
//     <NodeViewWrapper className="pers-name-wrapper">
//       <div>PersNameNode</div>
//     </NodeViewWrapper>
//   );
// };

// export const PersNameContent = Node.create({
//   name: "persName",
//   group: "block",
//   content: "inline*",
//   addAttributes() {
//     return {
//       //   type: {
//       //     default: "personal",
//       //   },
//       ref: {
//         default: "",
//       },
//     };
//   },
//   parseHTML() {
//     return [{ tag: "pers-name" }];
//   },
//   renderHTML({ HTMLAttributes }: { HTMLAttributes: Attributes }) {
//     return ["pers-name", HTMLAttributes, 0];
//   },
//   addNodeView() {
//     return ReactNodeViewRenderer(PersNameNode);
//   },
//   //   addCommands() {
//   //     return {
//   //       setPersName:
//   //         (attributes: Attributes) =>
//   //         ({ commands }: any) => {
//   //           return commands.wrapIn(this.name, attributes);
//   //         },
//   //     };
//   //   },
// });
