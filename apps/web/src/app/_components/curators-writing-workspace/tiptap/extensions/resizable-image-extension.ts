import Image from "@tiptap/extension-image";
import { ReactRenderer } from "@tiptap/react";
import { ResizableImageNodeView } from "../node-views/resizable-image-node-view";

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes: { width: string }) => {
          if (!attributes.width) {
            return {};
          }
          return {
            width: attributes.width,
          };
        },
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute("height"),
        renderHTML: (attributes: { height: string }) => {
          if (!attributes.height) {
            return {};
          }
          return {
            height: attributes.height,
          };
        },
      },
    };
  },

  addNodeView() {
    return (props) => {
      const { node: initialNode, getPos, editor } = props;
      let currentNode = initialNode;

      const updateAttributes = (attrs: Record<string, unknown>) => {
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) {
            editor
              .chain()
              .focus()
              .setNodeSelection(pos)
              .updateAttributes("image", attrs)
              .run();
          }
        }
      };

      const isSelected = () => {
        const { from, to } = editor.state.selection;
        if (typeof getPos === "function") {
          const pos = getPos();
          return pos !== undefined && from <= pos && to >= pos;
        }
        return false;
      };

      const getCurrentNode = () => {
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) {
            const nodeAtPos = editor.state.doc.nodeAt(pos);
            if (nodeAtPos) {
              return nodeAtPos;
            }
          }
        }
        return currentNode;
      };

      const renderer = new ReactRenderer(ResizableImageNodeView, {
        props: {
          node: currentNode,
          updateAttributes,
          selected: isSelected(),
          editor,
        },
        editor,
      });

      return {
        dom: renderer.element,
        contentDOM: null,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "image") {
            return false;
          }
          currentNode = updatedNode;
          renderer.updateProps({
            node: updatedNode,
            updateAttributes,
            selected: isSelected(),
            editor,
          });
          return true;
        },
        selectNode: () => {
          const node = getCurrentNode();
          renderer.updateProps({
            node,
            updateAttributes,
            selected: true,
            editor,
          });
        },
        deselectNode: () => {
          const node = getCurrentNode();
          renderer.updateProps({
            node,
            updateAttributes,
            selected: false,
            editor,
          });
        },
        destroy: () => {
          renderer.destroy();
        },
      };
    };
  },
});
