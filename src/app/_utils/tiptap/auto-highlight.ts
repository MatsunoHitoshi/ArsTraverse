import type { CustomNodeType } from "@/app/const/types";
import type { Editor } from "@tiptap/react";

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const customTagTags = ["pers-name", "place-name"];

const customTagMatch: Record<string, string> = {
  "pers-name": "Person",
  "place-name": "Place",
};

export const performHighlightUpdate = (
  editor: Editor,
  entities: CustomNodeType[],
  isUpdatingHighlightsRef: React.MutableRefObject<boolean>,
  onNewHighlighted?: (entityName: string) => void,
) => {
  console.log("performHighlightUpdate");
  if (!editor || editor.isDestroyed) return;

  // ハイライト更新中フラグを設定
  isUpdatingHighlightsRef.current = true;

  try {
    // 現在のカーソル位置を保存
    const currentSelection = editor.state.selection;

    // 既存のハイライトをクリア
    editor.commands.unsetEntityHighlight();
    editor.commands.unsetCustomTagHighlight();

    // エディタのドキュメント構造を取得
    const doc = editor.state.doc;

    // 各エンティティ名をハイライト
    const sortedEntities = [...entities].sort(
      (a, b) => b.name.length - a.name.length,
    );

    // すべてのマッチを収集（ドキュメント構造を直接使用）
    const allMatches: Array<{
      start: number;
      end: number;
      entityName: string;
    }> = [];

    // ドキュメントの各ブロックを走査
    doc.descendants((node, pos) => {
      if (node.isText) {
        const text = node.text ?? "";

        sortedEntities.forEach((entity) => {
          const regex = new RegExp(escapeRegExp(entity.name), "gi");
          let match;

          while ((match = regex.exec(text)) !== null) {
            allMatches.push({
              start: pos + match.index,
              end: pos + match.index + entity.name.length,
              entityName: entity.name,
            });
          }
        });
      }
    });

    // 開始位置でソート
    allMatches.sort((a, b) => a.start - b.start);

    // 後ろから前に向かってハイライトを適用（位置のずれを防ぐ）
    allMatches.reverse().forEach(({ start, end, entityName }) => {
      try {
        // 選択範囲を設定
        editor.commands.setTextSelection({ from: start, to: end });

        // エンティティのlabelを確認してPersonの場合はpers - nameタグで囲む;
        const entity = entities.find((e) => e.name === entityName);

        customTagTags.forEach((tagName) => {
          if (entity?.label === customTagMatch[tagName]) {
            editor.commands.setCustomTagHighlight({
              tagName,
              entityName,
              ref: entity?.id ?? "",
            });
          }
        });

        //通常のハイライトを適用
        editor.commands.setEntityHighlight({ entityName });
      } catch (error) {
        console.warn(
          `Failed to highlight entity "${entityName}" at position ${start}-${end}:`,
          error,
        );
      }
    });

    // カーソル位置の直前にハイライトされたエンティティを検出
    if (onNewHighlighted) {
      const cursorPos = currentSelection.from;
      const newHighlightedEntity = allMatches.find(
        (match) => match.start < cursorPos && match.end >= cursorPos,
      );

      if (newHighlightedEntity) {
        onNewHighlighted(newHighlightedEntity.entityName);
      }
    }

    // カーソル位置を復元
    try {
      if (currentSelection.from <= editor.state.doc.content.size) {
        editor.commands.setTextSelection({
          from: Math.min(currentSelection.from, editor.state.doc.content.size),
          to: Math.min(currentSelection.to, editor.state.doc.content.size),
        });
      }
    } catch (error) {
      // カーソル位置の復元に失敗した場合は最後に戻す
      const docSize = editor.state.doc.content.size;
      editor.commands.setTextSelection(docSize);
    }
  } catch (error) {
    console.error("Error updating highlights:", error);
  } finally {
    // ハイライト更新完了後にフラグをリセット
    setTimeout(() => {
      isUpdatingHighlightsRef.current = false;
    }, 100);
  }
};
