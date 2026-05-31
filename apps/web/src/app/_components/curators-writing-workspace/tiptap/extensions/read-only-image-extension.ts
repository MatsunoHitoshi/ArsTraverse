import Image from "@tiptap/extension-image";

/**
 * 読み取り専用エディタ用。width/height を保持するが React NodeView は使わない
 * （ReactRenderer + setContent が useEffect 内だと flushSync 警告の原因になる）。
 */
export const ReadOnlyImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes: { width?: string | null }) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        },
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute("height"),
        renderHTML: (attributes: { height?: string | null }) => {
          if (!attributes.height) return {};
          return { height: attributes.height };
        },
      },
    };
  },
});
