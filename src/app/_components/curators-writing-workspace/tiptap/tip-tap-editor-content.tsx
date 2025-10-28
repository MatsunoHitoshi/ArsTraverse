import React, {
  useEffect,
  useRef,
  useCallback,
  useContext,
  useState,
} from "react";
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
import type {
  CustomNodeType,
  GraphDocumentForFrontend,
} from "@/app/const/types";
import { EditorToolBar } from "./tools/editor-tool-bar";
import { CustomBubbleMenu } from "./tools/bubble-menu";
import { TeiCustomTagHighlightExtensions } from "./tei/tei-custom-tag-highlight-extension";
import { TiptapStyles } from "./styles";
import { KeyboardHandlerExtension } from "./extensions/keyboard-handler-extension";
import { useTextCompletion } from "./hooks/use-text-completion";
import { useHighlight } from "./hooks/use-highlight";
import { TiptapGraphFilterContext } from "..";
import { HighlightVisibilityProvider } from "./contexts/highlight-visibility-context";
import TextAlign from "@tiptap/extension-text-align";
import { useMentionConfig } from "./hooks/use-mention-config";

interface TipTapEditorContentProps {
  content: JSONContent;
  onUpdate: (content: JSONContent, updateAllowed: boolean) => void;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string) => void;
  workspaceId: string;
  onGraphUpdate?: (additionalGraph: GraphDocumentForFrontend) => void;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
}

export const TipTapEditorContent: React.FC<TipTapEditorContentProps> = ({
  content,
  onUpdate,
  entities,
  onEntityClick,
  workspaceId,
  onGraphUpdate,
  setIsGraphEditor,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const DEBOUNCE_TIME = 1000;
  const {} = useContext(TiptapGraphFilterContext);

  const [isAIAssistEnabled, setIsAIAssistEnabled] = useState<boolean>(false);

  // カスタムフックを使用
  const textCompletion = useTextCompletion({
    workspaceId,
    isAIAssistEnabled,
  });

  // ハイライト処理用のカスタムフック（エディタは後で設定）
  const highlight = useHighlight({
    editor: null,
    entities,
    onEntityClick,
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

  const { mentionExtension, updateEditor } = useMentionConfig({
    entities,
  });

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
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      ...(mentionExtension ? [mentionExtension] : []),
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

  // エディタインスタンスをmentionConfigに設定
  useEffect(() => {
    if (editor && updateEditor) {
      updateEditor(editor);
    }
  }, [editor, updateEditor]);

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

    // クリックされた要素がメンションかどうかをチェック
    const target = e.target as HTMLElement;
    const mentionElement = target.closest('[data-type="mention"]');

    if (mentionElement) {
      const entityName = mentionElement.getAttribute("data-label");
      if (entityName && onEntityClick) {
        onEntityClick(entityName);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    // ハイライトフックのクリック処理を使用
    highlight.handleHighlightClick(e);
  };

  if (!editor) {
    return <div className="text-gray-400">エディタを初期化中...</div>;
  }

  return (
    <HighlightVisibilityProvider>
      <div className="relative flex h-full flex-col gap-2">
        <div className="text-white">
          <EditorToolBar
            editor={editor}
            isAIAssistEnabled={isAIAssistEnabled}
            setIsAIAssistEnabled={setIsAIAssistEnabled}
          />
        </div>
        <div className="h-full overflow-y-hidden">
          <EditorContent
            ref={editorRef}
            editor={editor}
            className="h-full min-h-[200px] overflow-y-scroll rounded-md bg-slate-800 p-3 text-white focus-within:outline-none"
            onClick={handleClick}
          />
          <CustomBubbleMenu
            editor={editor}
            onGraphUpdate={onGraphUpdate}
            setIsGraphEditor={setIsGraphEditor}
            entities={entities}
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
    </HighlightVisibilityProvider>
  );
};
