import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";

interface KeyboardHandlerOptions {
  onTabKey: (editor: Editor) => void;
  onEnterKey: (editor: Editor) => boolean;
  onEscapeKey: (editor: Editor) => boolean;
}

export const KeyboardHandlerExtension =
  Extension.create<KeyboardHandlerOptions>({
    name: "keyboardHandler",

    addOptions() {
      return {
        onTabKey: () => {
          console.log("onTabKey");
        },
        onEnterKey: () => false,
        onEscapeKey: () => false,
      };
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("keyboardHandler"),
          props: {
            handleKeyDown: (view, event) => {
              const editor = this.editor;

              // Tabキーが押された場合
              if (event.key === "Tab") {
                event.preventDefault();
                this.options.onTabKey(editor);
                return true;
              }

              // Enterキーが押された場合
              if (event.key === "Enter") {
                const handled = this.options.onEnterKey(editor);
                if (handled) {
                  event.preventDefault();
                  return true;
                }
              }

              // Escapeキーが押された場合
              if (event.key === "Escape") {
                const handled = this.options.onEscapeKey(editor);
                if (handled) {
                  event.preventDefault();
                  return true;
                }
              }

              return false;
            },
          },
        }),
      ];
    },
  });
