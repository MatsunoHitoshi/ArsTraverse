import { useEffect, useRef, useCallback, useContext } from "react";
import type { Editor } from "@tiptap/core";
import type { CustomNodeType } from "@/app/const/types";
import { performHighlightUpdate } from "@/app/_utils/tiptap/auto-highlight";
import { HighlightVisibilityContext } from "../contexts/highlight-visibility-context";

const TYPING_IDLE_THRESHOLD_MS = 800;

interface UseHighlightOptions {
  editor: Editor | null;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string) => void;
  onNewHighlight?: (editor: Editor, entityName: string) => void;
  isTextSuggestionMode?: boolean;
  /** 最後にユーザーがタイプした時刻 (Date.now()) を保持する ref */
  lastTypingTimestampRef?: React.MutableRefObject<number>;
}

export const useHighlight = ({
  editor,
  entities,
  onEntityClick,
  onNewHighlight,
  isTextSuggestionMode = false,
  lastTypingTimestampRef,
}: UseHighlightOptions) => {
  const isUpdatingHighlightsRef = useRef(false);
  const isHighlightClickRef = useRef(false);
  const editorRef = useRef<Editor | null>(editor);
  const onNewHighlightRef = useRef(onNewHighlight);
  const handleNewHighlightRef =
    useRef<(editor: Editor, entityName: string) => void>();
  const pendingHighlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  const highlightContext = useContext(HighlightVisibilityContext);
  const isHighlightVisible = highlightContext?.isHighlightVisible ?? true;

  const handleNewHighlight = useCallback(
    (editor: Editor, entityName: string) => {
      if (isHighlightClickRef.current) return;
      if (onNewHighlightRef.current) {
        onNewHighlightRef.current(editor, entityName);
      }
    },
    [],
  );

  useEffect(() => {
    handleNewHighlightRef.current = handleNewHighlight;
  }, [handleNewHighlight]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    onNewHighlightRef.current = onNewHighlight;
  }, [onNewHighlight]);

  const handleHighlightClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isHighlightVisible) return;

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

  const isUserTyping = useCallback(() => {
    if (!lastTypingTimestampRef) return false;
    return Date.now() - lastTypingTimestampRef.current < TYPING_IDLE_THRESHOLD_MS;
  }, [lastTypingTimestampRef]);

  const cancelPendingHighlight = useCallback(() => {
    if (pendingHighlightTimerRef.current) {
      clearTimeout(pendingHighlightTimerRef.current);
      pendingHighlightTimerRef.current = null;
    }
  }, []);

  const triggerHighlightUpdate = useCallback(() => {
    if (!editorRef.current || entities.length === 0) return;
    if (isTextSuggestionMode) return;

    cancelPendingHighlight();

    // ユーザーがタイピング中の場合はアイドルになるまで遅延
    if (isUserTyping()) {
      pendingHighlightTimerRef.current = setTimeout(() => {
        pendingHighlightTimerRef.current = null;
        triggerHighlightUpdate();
      }, TYPING_IDLE_THRESHOLD_MS);
      return;
    }

    performHighlightUpdate(
      editorRef.current,
      entities,
      isUpdatingHighlightsRef,
      (entityName) => {
        if (handleNewHighlightRef.current) {
          handleNewHighlightRef.current(editorRef.current!, entityName);
        }
      },
    );
  }, [entities, isTextSuggestionMode, isUserTyping, cancelPendingHighlight]);

  useEffect(() => {
    return () => {
      cancelPendingHighlight();
    };
  }, [cancelPendingHighlight]);

  return {
    isUpdatingHighlightsRef,
    isHighlightClickRef,
    handleHighlightClick,
    editorRef,
    triggerHighlightUpdate,
    cancelPendingHighlight,
  };
};
