import { useEffect, useRef, useCallback, useContext } from "react";
import type { Editor } from "@tiptap/core";
import type { CustomNodeType } from "@/app/const/types";
import { performHighlightUpdate } from "@/app/_utils/tiptap/auto-highlight";
import { HighlightVisibilityContext } from "../contexts/highlight-visibility-context";

interface UseHighlightOptions {
  editor: Editor | null;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string) => void;
  onNewHighlight?: (editor: Editor, entityName: string) => void;
  isTextSuggestionMode?: boolean;
}

export const useHighlight = ({
  editor,
  entities,
  onEntityClick,
  onNewHighlight,
  isTextSuggestionMode = false,
}: UseHighlightOptions) => {
  const isUpdatingHighlightsRef = useRef(false);
  const isHighlightClickRef = useRef(false);
  const editorRef = useRef<Editor | null>(editor);
  const onNewHighlightRef = useRef(onNewHighlight);
  const handleNewHighlightRef =
    useRef<(editor: Editor, entityName: string) => void>();

  // ハイライト表示状態を取得（プロバイダーが存在しない場合はデフォルトでtrue）
  const highlightContext = useContext(HighlightVisibilityContext);
  const isHighlightVisible = highlightContext?.isHighlightVisible ?? true;

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

  // handleNewHighlightの参照を更新
  useEffect(() => {
    handleNewHighlightRef.current = handleNewHighlight;
  }, [handleNewHighlight]);

  // エディタの参照を更新
  useEffect(() => {
    console.log("editorRef.current: ", editorRef.current);
    editorRef.current = editor;
  }, [editor]);

  // コールバック関数の参照を更新
  useEffect(() => {
    onNewHighlightRef.current = onNewHighlight;
  }, [onNewHighlight]);

  // ハイライトクリック処理
  const handleHighlightClick = useCallback(
    (e: React.MouseEvent) => {
      // ハイライトが非表示の場合はクリックイベントを無視
      if (!isHighlightVisible) {
        return;
      }

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
    [onEntityClick, isHighlightVisible],
  );

  // 手動でハイライトを実行する関数
  const triggerHighlightUpdate = useCallback(() => {
    if (!editorRef.current || entities.length === 0) {
      console.log(
        "Cannot trigger highlight update: editor or entities not available",
      );
      return;
    }

    // テキスト提案モードがアクティブな場合はスキップ
    if (isTextSuggestionMode) {
      console.log("Skipping highlight update - text suggestion mode is active");
      return;
    }
    performHighlightUpdate(
      editorRef.current,
      entities,
      isUpdatingHighlightsRef,
      (entityName) => {
        console.log("New highlight detected:", entityName);
        if (handleNewHighlightRef.current) {
          handleNewHighlightRef.current(editorRef.current!, entityName);
        }
      },
    );
  }, [entities, isTextSuggestionMode]);

  return {
    isUpdatingHighlightsRef,
    isHighlightClickRef,
    handleHighlightClick,
    editorRef: editorRef,
    triggerHighlightUpdate,
    // エディタが設定されたときのハイライト処理を手動でトリガーする関数
    triggerHighlightOnEditorSet: () => {
      if (editorRef.current && entities.length > 0) {
        triggerHighlightUpdate();
      }
    },
  };
};
