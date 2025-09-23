import { type Attributes, Mark, mergeAttributes } from "@tiptap/core";

export interface TextCompletionMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textCompletion: {
      /**
       * テキスト補完マークを設定する
       */
      setTextCompletion: (attributes?: Attributes) => ReturnType;
      /**
       * テキスト補完マークを削除する
       */
      unsetTextCompletion: () => ReturnType;
    };
  }
}

export const TextCompletionMark = Mark.create<TextCompletionMarkOptions>({
  name: "textCompletion",

  addOptions() {
    return {
      HTMLAttributes: {
        class: "text-completion-mark",
        "data-completion": "true",
      },
    };
  },

  addAttributes() {
    return {
      completion: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-completion"),
        renderHTML: (attributes) => {
          return {
            "data-completion": String(attributes.completion),
            class: "text-completion-mark",
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-completion]",
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
      setTextCompletion:
        (attributes = {}) =>
        ({ chain }) => {
          return chain().setMark(this.name, attributes).run();
        },
      unsetTextCompletion:
        () =>
        ({ chain }) => {
          console.log("---unsetTextCompletion");
          return chain().unsetMark(this.name).run();
        },
    };
  },
});
