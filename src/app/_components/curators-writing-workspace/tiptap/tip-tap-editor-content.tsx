import React, { useEffect, useRef, useCallback, useContext } from "react";
import {
  useEditor,
  EditorContent,
  type JSONContent,
  type Editor,
} from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { EntityHighlight } from "./extensions/entity-highlight-extension";
import { TextCompletionMark } from "./extensions/text-completion-mark";
import { TeiStyles } from "./tei/tei-styles";
import { performHighlightUpdate } from "@/app/_utils/tiptap/auto-highlight";
import type { CustomNodeType } from "@/app/const/types";
import { TiptapEditorToolBar } from "./tools/tool-bar";
import { TeiCustomTagHighlightExtensions } from "./tei/tei-custom-tag-highlight-extension";
import { TiptapStyles } from "./styles";
import { KeyboardHandlerExtension } from "./extensions/keyboard-handler-extension";
import { useTextCompletion } from "./hooks/use-text-completion";
import { TiptapGraphFilterContext } from "..";

interface TipTapEditorContentProps {
  content: JSONContent;
  onUpdate: (content: JSONContent, updateAllowed: boolean) => void;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string) => void;
  workspaceId: string;
}

export const TipTapEditorContent: React.FC<TipTapEditorContentProps> = ({
  content,
  onUpdate,
  entities,
  onEntityClick,
  workspaceId,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout>();
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const isUpdatingHighlightsRef = useRef(false); // ハイライト更新中フラグ
  const isHighlightClickRef = useRef(false); // ハイライトクリック中フラグ
  const DEBOUNCE_TIME = 1000;
  const { tiptapGraphFilterOption, setTiptapGraphFilterOption } = useContext(
    TiptapGraphFilterContext,
  );
  // カスタムフックを使用
  const textCompletion = useTextCompletion({ workspaceId });

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
      const updateAllowed =
        !isUpdatingHighlightsRef.current &&
        !textCompletion.isUpdatingTextCompletionSuggestionRef.current;

      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        onUpdate(content, updateAllowed);
      }, DEBOUNCE_TIME);
    },
    [onUpdate, textCompletion.isUpdatingTextCompletionSuggestionRef],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      EntityHighlight,
      TextCompletionMark,
      ...TeiCustomTagHighlightExtensions,
      KeyboardHandlerExtension.configure({
        onTabKey: (editor) => textCompletion.handleTabKey(editor, editorRef),
        onEnterKey: (editor) => textCompletion.handleEnterKey(editor),
        onEscapeKey: (editor) => textCompletion.handleEscapeKey(editor),
      }),
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
      setTimeout(() => {
        if (
          textCompletion.isTextSuggestionMode &&
          !textCompletion.isSuggestionLoading
        ) {
          console.log("カーソル移動時にテキスト提案モードを無効化!!");
          textCompletion.disableTextSuggestionMode(editor!);
        }
      }, 100);
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        console.log("onKeyDown: ", event.key);
        return false;
      },
    },
    immediatelyRender: false,
  });

  // エンティティ名のハイライトを適用
  useEffect(() => {
    if (!editor || entities.length === 0) return;

    // エディタの準備が完了してからハイライトを適用
    const applyHighlightsWithDelay = () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }

      highlightTimeoutRef.current = setTimeout(() => {
        if (editor.isDestroyed) return;
        performHighlightUpdate(
          editor,
          entities,
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
  }, [editor, entities, handleNewHighlight]);

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
    if (textCompletion.isTextSuggestionMode) {
      console.log(
        "テキスト提案モードがアクティブな場合、マウスクリックで無効化!!",
      );
      textCompletion.disableTextSuggestionMode(editor!);
    }

    // ハイライトされたエンティティのクリック処理
    if (target.dataset.entityName && onEntityClick) {
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
    <div className="relative flex h-full flex-col gap-1">
      <div className="text-white">
        <TiptapEditorToolBar editor={editor} />
      </div>
      <div className="h-full overflow-y-hidden">
        <EditorContent
          ref={editorRef}
          editor={editor}
          className="h-full min-h-[200px] overflow-y-scroll rounded-md border border-gray-600 bg-slate-800 p-3 text-white focus-within:outline-none"
          onClick={handleClick}
        />
        {textCompletion.isSuggestionLoading &&
          textCompletion.cursorPosition && (
            <div
              className="pointer-events-none absolute z-10"
              style={{
                left: `${textCompletion.cursorPosition.x}px`,
                top: `${textCompletion.cursorPosition.y}px`,
              }}
            >
              <div className="flex items-center space-x-1 rounded-md bg-slate-700/60 px-2 py-1 shadow-lg">
                <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent"></div>
                <span className="text-xs text-white">生成中...</span>
              </div>
            </div>
          )}
        <TeiStyles />
        <TiptapStyles />
      </div>
    </div>
  );
};
