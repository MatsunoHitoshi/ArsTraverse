import { useEffect, useRef, useCallback } from "react";
import type { Editor } from "@tiptap/core";
import type { CustomNodeType } from "@/app/const/types";
import { performHighlightUpdate } from "@/app/_utils/tiptap/auto-highlight";

interface UseHighlightOptions {
  editor: Editor | null;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string) => void;
  onNewHighlight?: (editor: Editor, entityName: string) => void;
}

export const useHighlight = ({
  editor,
  entities,
  onEntityClick,
  onNewHighlight,
}: UseHighlightOptions) => {
  const highlightTimeoutRef = useRef<NodeJS.Timeout>();
  const isUpdatingHighlightsRef = useRef(false);
  const isHighlightClickRef = useRef(false);
  const editorRef = useRef<Editor | null>(editor);
  const onNewHighlightRef = useRef(onNewHighlight);

  // 新しいハイライトが検出されたときのコールバック
  const handleNewHighlight = useCallback(
    (editor: Editor, entityName: string) => {
      if (isHighlightClickRef.current) return;

      console.log("----- New highlight detected -----\n", entityName);

      if (onNewHighlightRef.current) {
        onNewHighlightRef.current(editor, entityName);
      }
    },
    [],
  );

  // エディタの参照を更新
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // コールバック関数の参照を更新
  useEffect(() => {
    onNewHighlightRef.current = onNewHighlight;
  }, [onNewHighlight]);

  // エンティティ名のハイライトを適用
  useEffect(() => {
    if (!editorRef.current || entities.length === 0) return;

    const applyHighlightsWithDelay = () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }

      highlightTimeoutRef.current = setTimeout(() => {
        if (editorRef.current?.isDestroyed) return;
        console.log("Applying highlights with entities:", entities.length);
        performHighlightUpdate(
          editorRef.current!,
          entities,
          isUpdatingHighlightsRef,
          (entityName) => handleNewHighlight(editorRef.current!, entityName),
        );
      }, 300);
    };

    if (editorRef.current?.isDestroyed) return;
    applyHighlightsWithDelay();

    const highlightTimeout = highlightTimeoutRef.current;

    return () => {
      if (highlightTimeout) {
        clearTimeout(highlightTimeout);
      }
    };
  }, [entities, handleNewHighlight]);

  // ハイライトクリック処理
  const handleHighlightClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.dataset.entityName && onEntityClick) {
        e.preventDefault();
        e.stopPropagation();

        isHighlightClickRef.current = true;

        setTimeout(() => {
          isHighlightClickRef.current = false;
        }, 500);

        onEntityClick(target.dataset.entityName);
      }
    },
    [onEntityClick],
  );

  // 手動でハイライトを実行する関数
  const triggerHighlightUpdate = useCallback(() => {
    if (!editorRef.current || entities.length === 0) {
      console.log(
        "Cannot trigger highlight update: editor or entities not available",
      );
      return;
    }

    console.log(
      "Manually triggering highlight update with entities:",
      entities.length,
    );
    performHighlightUpdate(
      editorRef.current,
      entities,
      isUpdatingHighlightsRef,
      (entityName) => {
        console.log("New highlight detected:", entityName);
        if (onNewHighlightRef.current) {
          onNewHighlightRef.current(editorRef.current!, entityName);
        }
      },
    );
  }, [entities]);

  return {
    isUpdatingHighlightsRef,
    isHighlightClickRef,
    handleHighlightClick,
    editorRef: editorRef,
    triggerHighlightUpdate,
  };
};
