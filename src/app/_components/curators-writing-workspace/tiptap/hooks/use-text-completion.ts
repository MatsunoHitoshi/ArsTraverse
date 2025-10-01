import { useState, useRef, useCallback, useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { api } from "@/trpc/react";
import {
  performTextCompletionSuggestion,
  confirmTextCompletion,
  clearAndDeleteTextCompletionMarks,
} from "@/app/_utils/tiptap/text-completion";
import { findEntityHighlights } from "@/app/_utils/text/find-entity-highlights";

interface UseTextCompletionOptions {
  workspaceId: string;
}

export const useTextCompletion = ({
  workspaceId,
}: UseTextCompletionOptions) => {
  const [isTextSuggestionMode, setIsTextSuggestionMode] =
    useState<boolean>(false);
  const [isSuggestionLoading, setIsSuggestionLoading] =
    useState<boolean>(false);
  const [cursorPosition, setCursorPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const isUpdatingTextCompletionSuggestionRef = useRef(false);
  const isTextSuggestionModeRef = useRef(false);
  const textCompletion = api.workspace.textCompletion.useMutation();

  // isTextSuggestionModeの状態をrefに同期
  useEffect(() => {
    isTextSuggestionModeRef.current = isTextSuggestionMode;
  }, [isTextSuggestionMode]);

  // カーソル位置を取得する関数
  const getCursorPosition = useCallback(
    (editor: Editor, editorRef: React.RefObject<HTMLDivElement>) => {
      if (!editor || !editorRef.current) return null;

      const selection = editor.state.selection;
      const coords = editor.view.coordsAtPos(selection.head);
      const editorRect = editorRef.current.getBoundingClientRect();

      return {
        x: coords.right - editorRect.left,
        y: coords.top - editorRect.top,
      };
    },
    [],
  );

  // テキスト提案モードを無効化する関数
  const disableTextSuggestionMode = useCallback((editor: Editor) => {
    // テキスト提案の出力中は無効化しない
    if (isUpdatingTextCompletionSuggestionRef.current) {
      console.log("テキスト提案の出力中は無効化をスキップ");
      return;
    }

    if (isTextSuggestionModeRef.current && editor) {
      console.log("テキスト提案モードを無効化");
      setIsTextSuggestionMode(false);
      clearAndDeleteTextCompletionMarks(
        editor,
        isUpdatingTextCompletionSuggestionRef,
      );
    }
  }, []);

  // カーソル位置に近いエンティティを取得する関数
  const getNearbyEntities = useCallback((editor: Editor, cursorPos: number) => {
    const allHighlights = findEntityHighlights(editor.getJSON().content || []);

    return allHighlights
      .map((highlight) => {
        const distance = Math.min(
          Math.abs(highlight.from - cursorPos),
          Math.abs(highlight.to - cursorPos),
          highlight.from <= cursorPos && highlight.to >= cursorPos
            ? 0
            : Infinity,
        );
        return { ...highlight, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((highlight) => highlight.name);
  }, []);

  // Tabキーが押された時の処理
  const handleTabKey = useCallback(
    (editor: Editor, editorRef: React.RefObject<HTMLDivElement>) => {
      if (isUpdatingTextCompletionSuggestionRef.current) return;

      // 既にテキスト提案モードがアクティブな場合はDeepMode
      const isDeepMode = isTextSuggestionModeRef.current;

      setIsSuggestionLoading(true);
      setCursorPosition(getCursorPosition(editor, editorRef));

      const cursorPos = editor.state.selection.from;
      const nearbyEntities = getNearbyEntities(editor, cursorPos);

      console.log("nearbyEntities: ", nearbyEntities);

      textCompletion.mutate(
        {
          workspaceId: workspaceId,
          baseText: editor.getText(),
          searchEntities: nearbyEntities,
          isDeepMode,
        },
        {
          onSuccess: (suggestion) => {
            if (isTextSuggestionModeRef.current) {
              clearAndDeleteTextCompletionMarks(
                editor,
                isUpdatingTextCompletionSuggestionRef,
              );
            }
            setIsTextSuggestionMode(true);

            performTextCompletionSuggestion(
              editor,
              isUpdatingTextCompletionSuggestionRef,
              suggestion,
            );
            setIsSuggestionLoading(false);
            setCursorPosition(null);
          },
          onError: (error) => {
            console.error(error);
            setIsSuggestionLoading(false);
            setCursorPosition(null);
          },
        },
      );
    },
    [workspaceId, textCompletion, getCursorPosition, getNearbyEntities],
  );

  // Enterキーが押された時の処理
  const handleEnterKey = useCallback((editor: Editor) => {
    if (isTextSuggestionModeRef.current && editor) {
      confirmTextCompletion(editor, isUpdatingTextCompletionSuggestionRef);
      setIsTextSuggestionMode(false);
      return true;
    }
    return false;
  }, []);

  // Escapeキーが押された時の処理
  const handleEscapeKey = useCallback(
    (editor: Editor) => {
      if (isTextSuggestionModeRef.current) {
        disableTextSuggestionMode(editor);
        return true;
      }
      return false;
    },
    [disableTextSuggestionMode],
  );

  return {
    isTextSuggestionMode,
    isSuggestionLoading,
    cursorPosition,
    isUpdatingTextCompletionSuggestionRef,
    disableTextSuggestionMode,
    handleTabKey,
    handleEnterKey,
    handleEscapeKey,
  };
};
