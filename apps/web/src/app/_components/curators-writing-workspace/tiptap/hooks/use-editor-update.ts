import { useRef, useCallback } from "react";
import type { JSONContent } from "@tiptap/react";

interface UseEditorUpdateOptions {
  onUpdate: (content: JSONContent) => void;
  isUpdatingHighlightsRef: React.MutableRefObject<boolean>;
  isUpdatingTextCompletionSuggestionRef: React.MutableRefObject<boolean>;
  debounceTime?: number;
}

export const useEditorUpdate = ({
  onUpdate,
  isUpdatingHighlightsRef,
  isUpdatingTextCompletionSuggestionRef,
  debounceTime = 1000,
}: UseEditorUpdateOptions) => {
  const updateTimeoutRef = useRef<NodeJS.Timeout>();

  // デバウンス処理付きのonUpdate
  const debouncedUpdate = useCallback(
    (content: JSONContent) => {
      // ハイライト更新中はonUpdateをスキップ
      if (isUpdatingHighlightsRef.current) return;
      if (isUpdatingTextCompletionSuggestionRef.current) return;

      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        onUpdate(content);
      }, debounceTime);
    },
    [
      onUpdate,
      isUpdatingHighlightsRef,
      isUpdatingTextCompletionSuggestionRef,
      debounceTime,
    ],
  );

  // クリーンアップ関数
  const cleanup = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
  }, []);

  return {
    debouncedUpdate,
    cleanup,
  };
};
