import type { CustomNodeType } from "@/app/const/types";
import type { Editor } from "@tiptap/react";
import {
  customTags,
  customTagMatch,
} from "@/app/_components/curators-writing-workspace/tiptap/tei/tei-custom-tag-highlight-extension";

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * 単一の ProseMirror トランザクションでエンティティハイライトを適用する。
 * setTextSelection を使わないため、カーソル位置は ProseMirror が自動保持する。
 * IME 入力中 (editor.view.composing) の場合は処理をスキップする。
 */
export const performHighlightUpdate = (
  editor: Editor,
  entities: CustomNodeType[],
  isUpdatingHighlightsRef: React.MutableRefObject<boolean>,
  onNewHighlighted?: (entityName: string) => void,
) => {
  if (!editor || editor.isDestroyed) return;

  // IME 入力中はスキップ（日本語・中国語等のコンポジション中断を防止）
  if (editor.view.composing) return;

  isUpdatingHighlightsRef.current = true;

  try {
    const { state } = editor;
    const { doc, schema, selection } = state;

    const tr = state.tr;

    // 既存のエンティティハイライトマークを一括削除
    const entityHighlightType = schema.marks.entityHighlight;
    if (entityHighlightType) {
      tr.removeMark(0, doc.content.size, entityHighlightType);
    }

    // 既存のカスタムタグハイライトマークを一括削除
    for (const tagName of customTags) {
      const customMarkType = schema.marks[`${tagName}-highlight`];
      if (customMarkType) {
        tr.removeMark(0, doc.content.size, customMarkType);
      }
    }

    // エンティティ名の長い順にソート（長いマッチを優先）
    const sortedEntities = [...entities].sort(
      (a, b) => b.name.length - a.name.length,
    );

    const allMatches: Array<{
      start: number;
      end: number;
      entityName: string;
      entity: CustomNodeType;
    }> = [];

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
              entity,
            });
          }
        });
      }
    });

    allMatches.sort((a, b) => a.start - b.start);

    // 単一トランザクション内で全マークを一括適用（カーソル移動なし）
    for (const { start, end, entityName, entity } of allMatches) {
      if (entityHighlightType) {
        tr.addMark(start, end, entityHighlightType.create({ entityName }));
      }

      for (const tagName of customTags) {
        if (entity.label === customTagMatch[tagName]) {
          const customMarkType = schema.marks[`${tagName}-highlight`];
          if (customMarkType) {
            tr.addMark(
              start,
              end,
              customMarkType.create({
                tagName,
                entityName,
                ref: entity.id ?? "",
              }),
            );
          }
        }
      }
    }

    tr.setMeta("addToHistory", false);
    tr.setMeta("highlightUpdate", true);

    editor.view.dispatch(tr);

    if (onNewHighlighted) {
      const cursorPos = selection.from;
      const newHighlightedEntity = allMatches.find(
        (match) => match.start < cursorPos && match.end >= cursorPos,
      );
      if (newHighlightedEntity) {
        onNewHighlighted(newHighlightedEntity.entityName);
      }
    }
  } catch (error) {
    console.error("Error updating highlights:", error);
  } finally {
    setTimeout(() => {
      isUpdatingHighlightsRef.current = false;
    }, 50);
  }
};
