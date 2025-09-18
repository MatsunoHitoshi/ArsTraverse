import React, { useEffect, useRef, useCallback, useState } from "react";
import {
  useEditor,
  EditorContent,
  type JSONContent,
  type Editor,
} from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { EntityHighlight } from "./entity-highlight-extension";
import { TextCompletionMark } from "./text-completion-mark";
// import { TeiElement, TeiAttribute } from "./tei-extensions";
// import { TeiTagButton } from "./tei-tag-panel";
import { TeiStyles } from "./tei-styles";
// import { PersNameContent } from "./tiptap/tei/pers-name-node";
// import { PersNameButton } from "./pers-name-button";
// import { TeiConverter } from "./tei-converter";
import { performHighlightUpdate } from "@/app/_utils/tiptap/auto-highlight";
import {
  performTextCompletionSuggestion,
  confirmTextCompletion,
  clearTextCompletionMarks,
} from "@/app/_utils/tiptap/text-completion";
import { api } from "@/trpc/react";

interface TipTapEditorContentProps {
  content: JSONContent;
  onUpdate: (content: JSONContent) => void;
  entityNames: string[];
  onEntityClick?: (entityName: string) => void;
  workspaceId: string;
}

export const TipTapEditorContent: React.FC<TipTapEditorContentProps> = ({
  content,
  onUpdate,
  entityNames,
  onEntityClick,
  workspaceId,
}) => {
  const [isTextSuggestionMode, setIsTextSuggestionMode] =
    useState<boolean>(false);
  const [isSuggestionLoading, setIsSuggestionLoading] =
    useState<boolean>(false);
  const [cursorPosition, setCursorPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const highlightTimeoutRef = useRef<NodeJS.Timeout>();
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const isUpdatingTextCompletionSuggestionRef = useRef(false);
  const isUpdatingHighlightsRef = useRef(false); // ハイライト更新中フラグ
  const isHighlightClickRef = useRef(false); // ハイライトクリック中フラグ
  const editorRef = useRef<HTMLDivElement>(null);
  const DEBOUNCE_TIME = 1000;
  const textCompletion = api.workspace.textCompletion.useMutation();
  const entityInformationCompletion =
    api.workspace.entityInformationCompletion.useMutation();

  // 新しいハイライトが検出されたときのコールバック
  const handleNewHighlight = useCallback(
    (editor: Editor, entityName: string) => {
      // ハイライトクリック中は処理をスキップ
      if (isHighlightClickRef.current) return;

      console.log("----- New highlight detected -----\n", entityName);
      // 挙動が安定しないためハイライトのアップデート処理は行わない
      // setIsSuggestionLoading(true);
      // setCursorPosition(getCursorPosition());
      // entityInformationCompletion.mutate(
      //   {
      //     workspaceId: workspaceId,
      //     entityName: entityName,
      //   },
      //   {
      //     onSuccess: (data) => {
      //       setIsTextSuggestionMode(true);
      //       performTextCompletionSuggestion(
      //         editor,
      //         entityNames,
      //         isUpdatingTextCompletionSuggestionRef,
      //         data.entityInformationText,
      //       );
      //       setIsSuggestionLoading(false);
      //       setCursorPosition(null);
      //     },
      //     onError: (error) => {
      //       console.error(error);
      //       setIsSuggestionLoading(false);
      //       setCursorPosition(null);
      //     },
      //   },
      // );
      // if (onEntityClick) {
      //   onEntityClick(entityName);
      // }
    },
    [onEntityClick],
  );

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
        // console.log("XML content: ", TeiConverter.toTei(content));
        onUpdate(content);
      }, DEBOUNCE_TIME);
    },
    [onUpdate],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      EntityHighlight,
      TextCompletionMark,
      // TeiElement,
      // TeiAttribute,
      // PersNameContent,
    ],
    content,
    onUpdate: ({ editor }) => {
      debouncedUpdate(editor.getJSON());
    },
    onFocus: () => {
      // フォーカス時にハイライトを更新
      // updateHighlights(true);
    },
    onSelectionUpdate: () => {
      // カーソル移動時にテキスト提案モードを無効化
      if (isTextSuggestionMode) {
        disableTextSuggestionMode();
      }
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        // Tabキーが押された場合
        if (event.key === "Tab") {
          event.preventDefault();
          console.log("event.key: ", event.key);
          // テキスト補完を実行
          if (!isUpdatingTextCompletionSuggestionRef.current && editor) {
            if (!isTextSuggestionMode) {
              setIsSuggestionLoading(true);
              setCursorPosition(getCursorPosition());
              textCompletion.mutate(
                {
                  workspaceId: workspaceId,
                  baseText: editor.getText(),
                },
                {
                  onSuccess: (suggestion) => {
                    setIsTextSuggestionMode(true);
                    performTextCompletionSuggestion(
                      editor,
                      entityNames,
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
            } else {
              setIsTextSuggestionMode(false);
              confirmTextCompletion(
                editor,
                isUpdatingTextCompletionSuggestionRef,
              );
            }
          }

          return true; // イベントを処理したことを示す
        }

        // Tab以外のキーが押された場合、テキスト提案モードを無効化
        if (isTextSuggestionMode) {
          disableTextSuggestionMode();
        }

        return false; // 他のキーは通常通り処理
      },
    },
    immediatelyRender: false,
  });

  // テキスト提案モードを無効化する関数
  const disableTextSuggestionMode = useCallback(() => {
    if (isTextSuggestionMode && editor) {
      setIsTextSuggestionMode(false);
      clearTextCompletionMarks(editor, isUpdatingTextCompletionSuggestionRef);
    }
  }, [isTextSuggestionMode, editor, isUpdatingTextCompletionSuggestionRef]);

  // カーソル位置を取得する関数
  const getCursorPosition = useCallback(() => {
    if (!editor || !editorRef.current) return null;

    const selection = editor.state.selection;
    const coords = editor.view.coordsAtPos(selection.head);
    const editorRect = editorRef.current.getBoundingClientRect();

    return {
      x: coords.right - editorRect.left,
      y: coords.top - editorRect.top,
    };
  }, [editor]);

  // エンティティ名のハイライトを適用
  useEffect(() => {
    if (!editor || entityNames.length === 0) return;

    // エディタの準備が完了してからハイライトを適用
    const applyHighlightsWithDelay = () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }

      highlightTimeoutRef.current = setTimeout(() => {
        if (editor.isDestroyed) return;
        performHighlightUpdate(
          editor,
          entityNames,
          isUpdatingHighlightsRef,
          (entityName) => handleNewHighlight(editor, entityName),
        );
      }, 300);
    };

    // エディタの準備完了を待つ
    if (editor.isDestroyed) return;

    // 少し遅延させてエディタの準備が完了してからハイライトを適用
    applyHighlightsWithDelay();

    // クリーンアップ関数で使用するref値をキャプチャ
    const highlightTimeout = highlightTimeoutRef.current;
    const debounceTimeout = debounceTimeoutRef.current;

    return () => {
      if (highlightTimeout) {
        clearTimeout(highlightTimeout);
      }
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [editor, entityNames, handleNewHighlight]);

  // クリーンアップ処理を改善
  useEffect(() => {
    // クリーンアップ関数で使用するref値をキャプチャ
    const highlightTimeout = highlightTimeoutRef.current;
    const debounceTimeout = debounceTimeoutRef.current;
    const updateTimeout = updateTimeoutRef.current;

    return () => {
      if (highlightTimeout) {
        clearTimeout(highlightTimeout);
      }
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
    };
  }, []);

  // エンティティハイライトのクリック処理
  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // テキスト提案モードがアクティブな場合、マウスクリックで無効化
    if (isTextSuggestionMode) {
      disableTextSuggestionMode();
    }

    // ハイライトされたエンティティのクリック処理
    if (
      target.classList.contains("bg-yellow-200") &&
      target.dataset.entityName &&
      onEntityClick
    ) {
      e.preventDefault();
      e.stopPropagation();

      // ハイライトクリック中フラグを設定
      isHighlightClickRef.current = true;

      // 少し遅延させてフラグをリセット（ハイライト更新処理が完了するまで待つ）
      setTimeout(() => {
        isHighlightClickRef.current = false;
      }, 500);

      onEntityClick(target.dataset.entityName);
    }
  };

  if (!editor) {
    return <div className="text-gray-400">エディタを初期化中...</div>;
  }

  return (
    <div className="relative h-full overflow-y-hidden">
      {/* TEIタグ挿入ボタン */}
      {/* <div className="absolute right-2 top-2 z-10 flex gap-2">
        {editor && <TeiTagButton editor={editor} />}
        {editor && <PersNameButton editor={editor} />}
      </div> */}

      <EditorContent
        ref={editorRef}
        editor={editor}
        className="h-full min-h-[200px] overflow-y-scroll rounded-md border border-gray-600 bg-slate-800 p-3 text-white focus-within:outline-none"
        onClick={handleClick}
      />
      {isSuggestionLoading && cursorPosition && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: `${cursorPosition.x}px`,
            top: `${cursorPosition.y}px`,
          }}
        >
          <div className="flex items-center space-x-1 rounded-md bg-slate-700/60 px-2 py-1 shadow-lg">
            <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent"></div>
            <span className="text-xs text-white">生成中...</span>
          </div>
        </div>
      )}
      <TeiStyles />
      <style jsx global>{`
        .ProseMirror {
          outline: none;
          height: 100%;
          min-height: 200px;
          color: white;
          font-family: inherit;
          line-height: 1.6;
        }

        .ProseMirror p {
          margin: 0.5em 0;
        }

        .ProseMirror p:first-child {
          margin-top: 0;
        }

        .ProseMirror p:last-child {
          margin-bottom: 0;
        }

        .ProseMirror .bg-yellow-200 {
          background-color: rgba(255, 255, 255, 0.2) !important;
          color: #ffffff !important;
          padding: 0.125rem 0.25rem !important;
          border-radius: 0.25rem !important;
          cursor: pointer !important;
          transition: background-color 0.2s !important;
          display: inline-block !important;
        }

        .ProseMirror .bg-yellow-200:hover {
          background-color: #fde68a !important;
          color: #000000 !important;
        }

        .ProseMirror .text-completion-mark {
          color: #6b7280 !important;
          opacity: 0.6 !important;
          user-select: none !important;
          pointer-events: none !important;
          font-style: italic !important;
        }
      `}</style>
    </div>
  );
};
