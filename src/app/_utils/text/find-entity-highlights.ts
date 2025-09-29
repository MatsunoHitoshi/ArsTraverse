import type { JSONContent } from "@tiptap/core";
export const findEntityHighlights = (
  content: JSONContent[],
): Array<{ name: string; from: number; to: number }> => {
  const highlights: Array<{
    name: string;
    from: number;
    to: number;
  }> = [];
  let position = 0;

  const traverse = (nodes: JSONContent[]) => {
    for (const node of nodes) {
      if (node.type === "text" && node.marks) {
        for (const mark of node.marks) {
          if (mark.type === "entityHighlight" && mark.attrs?.entityName) {
            highlights.push({
              name: mark.attrs.entityName as string,
              from: position,
              to: position + (node.text?.length ?? 0),
            });
          }
        }
        position += node.text?.length ?? 0;
      } else if (node.content) {
        traverse(node.content);
      }
    }
  };

  traverse(content);
  return highlights;
};
