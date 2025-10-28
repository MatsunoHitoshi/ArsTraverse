import { useCallback, useRef, useEffect, useMemo } from "react";
import type { CustomNodeType } from "@/app/const/types";
import type { Editor } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import { useMentionSuggestion } from "../suggestions/use-mention-suggestion";

interface UseMentionConfigOptions {
  entities: CustomNodeType[];
}

interface MentionCommandProps {
  items: Array<{ id: string; label: string }>;
  selectedIndex: number;
  selectItem: (index: number) => void;
  command: (item: { id: string; label: string }) => void;
  clientRect: () => DOMRect | null;
}

interface MentionEventProps {
  event: KeyboardEvent;
  items: Array<{ id: string; label: string }>;
  selectedIndex: number;
}

export const useMentionConfig = ({ entities }: UseMentionConfigOptions) => {
  const editorRef = useRef<Editor | null>(null);

  // editorを更新する関数
  const updateEditor = useCallback((editor: Editor | null) => {
    editorRef.current = editor;
  }, []);
  // entitiesをrefに保存して常に最新の値にアクセスできるようにする
  const entitiesRef = useRef<CustomNodeType[]>(entities);

  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  // Mention suggestionのカスタムフック
  const mentionSuggestion = useMentionSuggestion();

  // TEIタグを適用する関数
  const applyTeiTagToMention = useCallback(
    (item: { id: string; label: string }) => {
      if (!editorRef.current || editorRef.current.isDestroyed) return;

      const editor = editorRef.current;

      // エンティティ情報を取得
      const entity = entitiesRef.current.find((e) => e.id === item.id);

      console.log(
        "Applying TEI tag to mention:",
        item.label,
        "entity label:",
        entity?.label,
      );

      if (!entity?.label) return;

      // 挿入されたMentionノードを探す
      let mentionStartPos = -1;
      let mentionEndPos = -1;

      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "mention" && node.attrs.id === item.id) {
          console.log("Found mention node:", node.attrs);
          mentionStartPos = pos;
          mentionEndPos = pos + node.nodeSize;
          console.log(
            "Match found, positions:",
            mentionStartPos,
            mentionEndPos,
          );
          return false; // 見つかったら停止
        }
      });

      if (mentionStartPos < 0) {
        console.log("Mention node not found!");
        return;
      }

      // エンティティのlabelに基づいてマーク名を決定
      let markName = "entityHighlight";
      let tagName = "entity";

      const tagMap: Record<string, string> = {
        Person: "pers-name",
        Place: "place-name",
        Artwork: "artwork",
        Event: "event-name",
      };

      const tagNameFromLabel = tagMap[entity.label];
      if (tagNameFromLabel) {
        markName = `${tagNameFromLabel}-highlight`;
        tagName = tagNameFromLabel;
      }

      console.log(
        "Applying mark:",
        markName,
        "to positions:",
        mentionStartPos,
        mentionEndPos,
      );

      // マークを適用
      editor
        .chain()
        .setTextSelection({
          from: mentionStartPos,
          to: mentionEndPos,
        })
        .setMark(markName, {
          entityName: item.label,
          tagName: tagName,
          ref: item.id,
        })
        .run();

      // カーソルをMentionの後に移動
      editor.commands.setTextSelection(mentionEndPos);
    },
    [],
  );

  // Mention拡張機能の設定
  const mentionExtension = useMemo(
    () =>
      Mention.configure({
        HTMLAttributes: {
          class:
            "mention-link entity-highlight cursor-pointer hover:bg-yellow-500/50 rounded px-1",
        },
        renderHTML({ node }) {
          const entityName =
            (node.attrs.label as string) || (node.attrs.id as string);
          return [
            "span",
            {
              "data-type": "mention",
              "data-id": node.attrs.id as string,
              "data-label": entityName,
              "data-entity-name": entityName,
              class:
                "mention-link entity-highlight cursor-pointer hover:bg-yellow-500/50 rounded px-1",
            },
            (node.attrs.label || node.attrs.id) as string, // @なしで表示
          ];
        },
        renderText({ node }) {
          // @なしでテキストとして表示
          return (node.attrs.label || node.attrs.id) as string;
        },
        suggestion: {
          char: "@",
          items: ({ query }) => {
            // entitiesRefから最新のentitiesを取得
            const currentEntities = entitiesRef.current;

            // クエリが空の場合は上位10件を返す
            if (!query) {
              return currentEntities.slice(0, 10).map((entity) => ({
                id: entity.id,
                label: entity.name,
              }));
            }

            // エンティティ名で検索（大文字小文字を区別しない）
            const filtered = currentEntities
              .filter((entity) =>
                entity.name.toLowerCase().includes(query.toLowerCase()),
              )
              .slice(0, 10)
              .map((entity) => ({
                id: entity.id,
                label: entity.name,
              }));

            return filtered;
          },
          render: () => {
            return {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onStart: (props: any) => {
                const commandProps = props as MentionCommandProps;
                const commandWrapper = (item: {
                  id: string;
                  label: string;
                }) => {
                  // メンションを挿入
                  commandProps.command(item);

                  // 挿入後にエンティティハイライトマークを適用
                  setTimeout(() => {
                    applyTeiTagToMention(item);
                  }, 100);
                };

                mentionSuggestion.show({
                  items: commandProps.items,
                  selectedIndex: commandProps.selectedIndex,
                  onItemSelect: commandWrapper,
                  clientRect: commandProps.clientRect,
                });
              },

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onUpdate: (props: any) => {
                const commandProps = props as MentionCommandProps;
                const commandWrapper = (item: {
                  id: string;
                  label: string;
                }) => {
                  commandProps.command(item);
                  setTimeout(() => {
                    applyTeiTagToMention(item);
                  }, 100);
                };

                mentionSuggestion.show({
                  items: commandProps.items,
                  selectedIndex: commandProps.selectedIndex,
                  onItemSelect: commandWrapper,
                  clientRect: commandProps.clientRect,
                });
              },

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onKeyDown: (props: any) => {
                const eventProps = props as MentionEventProps;
                const { event } = eventProps;

                // Escapeキーでメンションをキャンセル
                if (event.key === "Escape") {
                  mentionSuggestion.hide();
                  return true;
                }

                // その他のキー（矢印キーやEnterキー）はデフォルトのSuggestion動作に任せる
                return false;
              },

              onExit: () => {
                mentionSuggestion.hide();
              },
            };
          },
        },
      }),
    [applyTeiTagToMention, mentionSuggestion],
  );

  return { mentionExtension, updateEditor };
};
