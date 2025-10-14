import { Mark, mergeAttributes } from "@tiptap/core";

export interface PerseNameHighlightOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const customTags = ["pers-name", "place-name", "artwork", "event"];

export const customTagMatch: Record<string, string> = {
  "pers-name": "Person",
  "place-name": "Place",
  artwork: "Artwork",
  "event-name": "Event",
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    customTagHighlight: {
      /**
       * エンティティ名をハイライトする
       */
      setCustomTagHighlight: (attributes: {
        entityName: string;
        tagName: string;
        ref: string;
      }) => ReturnType;
      /**
       * エンティティハイライトを削除する
       */
      unsetCustomTagHighlight: () => ReturnType;
    };
  }
}

export const TeiCustomTagHighlight = (tagName: string) =>
  Mark.create<PerseNameHighlightOptions>({
    name: `${tagName}-highlight`,

    addOptions() {
      return {
        HTMLAttributes: {
          class: "underline",
        },
      };
    },

    addAttributes() {
      return {
        entityName: {
          default: null,
          parseHTML: (element) => element.getAttribute(`data-${tagName}`),
          renderHTML: (attributes) => {
            return {
              "data-entity-name": attributes.entityName as string,
              class: "underline",
            };
          },
        },
        tagName: {
          default: null,
          parseHTML: (element) => element.getAttribute(`data-${tagName}`),
          renderHTML: (attributes) => {
            const dataTagName = `data-${attributes.tagName as string}`;
            return {
              [dataTagName]: "true",
            };
          },
        },
        ref: {
          default: null,
          parseHTML: (element) => element.getAttribute("ref"),
          renderHTML: (attributes) => {
            return {
              ref: attributes.ref as string,
            };
          },
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: `span[data-entity-name][data-${tagName}]`,
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
        setCustomTagHighlight:
          (attributes) =>
          ({ commands, chain, tr }) => {
            return chain()
              .setMark(this.name, attributes)
              .command(({ tr }) => {
                tr.setMeta("addToHistory", false);
                return true;
              })
              .run();
          },
        unsetCustomTagHighlight:
          () =>
          ({ commands, chain, state, tr }) => {
            return chain()
              .setTextSelection({
                from: 0,
                to: state.doc.content.size,
              })
              .unsetMark(this.name)
              .command(({ tr }) => {
                tr.setMeta("addToHistory", false);
                return true;
              })
              .run();
          },
      };
    },
  });

export const TeiCustomTagHighlightExtensions = customTags.map((tagName) =>
  TeiCustomTagHighlight(tagName),
);
