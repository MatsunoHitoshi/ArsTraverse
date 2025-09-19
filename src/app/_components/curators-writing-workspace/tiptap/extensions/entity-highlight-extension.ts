import { Mark, mergeAttributes } from "@tiptap/core";

export interface EntityHighlightOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    entityHighlight: {
      /**
       * エンティティ名をハイライトする
       */
      setEntityHighlight: (attributes: { entityName: string }) => ReturnType;
      /**
       * エンティティハイライトを削除する
       */
      unsetEntityHighlight: () => ReturnType;
    };
  }
}

export const EntityHighlight = Mark.create<EntityHighlightOptions>({
  name: "entityHighlight",

  addOptions() {
    return {
      HTMLAttributes: {
        "data-entity-name": "",
        class: "entity-highlight",
      },
    };
  },

  addAttributes() {
    return {
      entityName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-entity-name"),
        renderHTML: (attributes) => {
          return {
            "data-entity-name": attributes.entityName as string,
            class: "entity-highlight",
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-entity-name]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setEntityHighlight:
        (attributes) =>
        ({ commands, chain }) => {
          return chain().setMark(this.name, attributes).run();
        },
      unsetEntityHighlight:
        () =>
        ({ commands, chain, state }) => {
          return chain()
            .setTextSelection({
              from: 0,
              to: state.doc.content.size,
            })
            .unsetMark(this.name)
            .run();
        },
    };
  },
});
