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
import type { CustomNodeType } from "@/app/const/types";
import { TiptapEditorToolBar } from "./tools/tool-bar";
import { TeiCustomTagHighlightExtensions } from "./tei/tei-custom-tag-highlight-extension";
import { TiptapStyles } from "./styles";
import { KeyboardHandlerExtension } from "./extensions/keyboard-handler-extension";
import { useTextCompletion } from "./hooks/use-text-completion";
import { useHighlight } from "./hooks/use-highlight";
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
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const DEBOUNCE_TIME = 1000;
  const {} = useContext(TiptapGraphFilterContext);

  // 新しいハイライトが検出されたときのコールバック
  const handleNewHighlight = useCallback(
    (editor: Editor, entityName: string) => {
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
    [],
  );

  // カスタムフックを使用
  const textCompletion = useTextCompletion({
    workspaceId,
  });

  // ハイライト処理用のカスタムフック（エディタは後で設定）
  const highlight = useHighlight({
    editor: null,
    entities,
    onEntityClick,
    onNewHighlight: handleNewHighlight,
    isTextSuggestionMode: textCompletion.isTextSuggestionMode,
  });

  // デバウンス処理付きのonUpdate
  const debouncedUpdate = useCallback(
    (content: JSONContent) => {
      // ハイライト更新中はonUpdateをスキップ
      const updateAllowed =
        !highlight.isUpdatingHighlightsRef.current &&
        !textCompletion.isUpdatingTextCompletionSuggestionRef.current;

      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        onUpdate(content, updateAllowed);
      }, DEBOUNCE_TIME);
    },
    [
      onUpdate,
      textCompletion.isUpdatingTextCompletionSuggestionRef,
      highlight.isUpdatingHighlightsRef,
    ],
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
    onSelectionUpdate: () => {
      // カーソル移動時にテキスト提案モードを無効化
      // ただし、テキスト提案の出力中やハイライト更新中は無効化しない
      setTimeout(() => {
        if (
          textCompletion.isTextSuggestionMode &&
          !textCompletion.isSuggestionLoading &&
          !textCompletion.isUpdatingTextCompletionSuggestionRef.current &&
          !highlight.isUpdatingHighlightsRef.current
        ) {
          console.log("カーソル移動時にテキスト提案モードを無効化!!");
          textCompletion.disableTextSuggestionMode(editor);
        }
      }, 100);
    },
    editorProps: {
      handleKeyDown: (_view, _event) => {
        return false;
      },
    },
    immediatelyRender: true,
  });

  // エディタが作成されたらハイライトフックに設定
  useEffect(() => {
    if (editor) {
      highlight.editorRef.current = editor;
      // エディタが設定されたらハイライト処理を手動でトリガー
      setTimeout(() => {
        highlight.triggerHighlightOnEditorSet();
      }, 500);
    }
  }, [editor, highlight.editorRef, highlight]);

  // クリーンアップ処理を改善
  useEffect(() => {
    // クリーンアップ関数で使用するref値をキャプチャ
    const debounceTimeout = debounceTimeoutRef.current;
    const updateTimeout = updateTimeoutRef.current;
    return () => {
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
    // テキスト提案モードがアクティブな場合、マウスクリックで無効化
    if (textCompletion.isTextSuggestionMode) {
      console.log(
        "テキスト提案モードがアクティブな場合、マウスクリックで無効化!!",
      );
      textCompletion.disableTextSuggestionMode(editor);
    }

    // ハイライトフックのクリック処理を使用
    highlight.handleHighlightClick(e);
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
