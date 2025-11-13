import React, {
  useEffect,
  useRef,
  useCallback,
  useContext,
  useState,
} from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
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
import { TiptapStyles } from "./styles/tiptap-styles";
import { KeyboardHandlerExtension } from "./extensions/keyboard-handler-extension";
import { useTextCompletion } from "./hooks/use-text-completion";
import { useHighlight } from "./hooks/use-highlight";
import { TiptapGraphFilterContext } from "..";
import { HighlightVisibilityProvider } from "./contexts/highlight-visibility-context";
import TextAlign from "@tiptap/extension-text-align";
import { useMentionConfig } from "./hooks/use-mention-config";
import { Button } from "../../button/button";
import { CheckIcon, CrossLargeIcon } from "../../icons";
import FileHandler from "@tiptap/extension-file-handler";
import { insertImageNode } from "@/app/_utils/tiptap/insert-image";
import { ResizableImage } from "./extensions/resizable-image-extension";
import { api } from "@/trpc/react";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { storageUtils } from "@/app/_utils/supabase/supabase";

interface TipTapEditorContentProps {
  content: JSONContent;
  onUpdate: (content: JSONContent, updateAllowed: boolean) => void;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string) => void;
  workspaceId: string;
  onGraphUpdate?: (additionalGraph: GraphDocumentForFrontend) => void;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGraphSelectionMode?: React.Dispatch<React.SetStateAction<boolean>>;
  completionWithSubgraphRef?: React.MutableRefObject<
    ((subgraph: GraphDocumentForFrontend) => void) | null
  >;
}

export const TipTapEditorContent: React.FC<TipTapEditorContentProps> = ({
  content,
  onUpdate,
  entities,
  onEntityClick,
  workspaceId,
  onGraphUpdate,
  setIsGraphEditor,
  setIsGraphSelectionMode,
  completionWithSubgraphRef,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const DEBOUNCE_TIME = 1000;
  const {} = useContext(TiptapGraphFilterContext);
  const [isImageInsert, setIsImageInsert] = useState<boolean>(false);
  const [isAIAssistEnabled, setIsAIAssistEnabled] = useState<boolean>(false);

  // tRPCクライアントのutilsを取得（非同期処理で使用）
  const utils = api.useUtils();

  // カスタムフックを使用
  const textCompletion = useTextCompletion({
    workspaceId,
    isAIAssistEnabled,
    onEnterAIMode: () => setIsGraphSelectionMode?.(true),
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
      ResizableImage,
      ...TeiCustomTagHighlightExtensions,
      KeyboardHandlerExtension.configure({
        onTabKey: (editor) => textCompletion.handleTabKey(editor, editorRef),
        onEnterKey: (editor) => textCompletion.handleEnterKey(editor),
        onEscapeKey: (editor) => textCompletion.handleEscapeKey(editor),
      }),
      FileHandler.configure({
        allowedMimeTypes: [
          "image/png",
          "image/jpeg",
          "image/gif",
          "image/webp",
        ],
        onDrop: (currentEditor, files, pos) => {
          Promise.all(
            files.map((file) =>
              insertImageNode(file, pos, currentEditor, setIsImageInsert),
            ),
          )
            .then(() => {
              onUpdate(currentEditor.getJSON(), true);
            })
            .catch((error) => {
              console.error("画像の挿入中にエラーが発生しました:", error);
            });
        },
        onPaste: (currentEditor, files, htmlContent) => {
          // HTMLコンテンツ内の画像URLを検出してアップロード
          if (htmlContent) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, "text/html");
            const imgElements = doc.querySelectorAll("img");

            if (imgElements.length > 0) {
              // HTMLコンテンツ内に画像がある場合、それらを処理
              const pos = currentEditor.state.selection.anchor;

              // 各画像を順番に処理（位置を更新しながら）
              let currentPos = pos;
              void (async () => {
                for (const img of Array.from(imgElements)) {
                  const src = img.getAttribute("src");
                  if (!src) continue;

                  try {
                    // tRPCを使用して画像を取得してからアップロード
                    const imageData = await utils.image.getBase64FromUrl.fetch({
                      url: src,
                    });

                    // 読み込み中メッセージを表示
                    currentEditor.commands.insertContent({ type: "paragraph" });
                    currentEditor
                      .chain()
                      .insertContentAt(
                        currentPos,
                        '<p><span style="color: #545476" class="text-v2-semantic-text-place-holder">読み込み中…</span></p>',
                      )
                      .focus()
                      .run();

                    // Supabaseにアップロード
                    const imageURL = await storageUtils.uploadFromDataURL(
                      imageData.dataUrl,
                      BUCKETS.PATH_TO_RICH_TEXT_IMAGES,
                    );

                    // 読み込み中メッセージを削除して画像を挿入
                    currentEditor.commands.deleteNode("paragraph");
                    currentEditor.commands.setImage({
                      src: imageURL,
                    });

                    setIsImageInsert(true);
                    // 次の画像の位置を更新（画像挿入後の位置）
                    currentPos = currentEditor.state.selection.anchor;
                  } catch (error) {
                    console.error(
                      "画像のアップロード中にエラーが発生しました:",
                      error,
                    );
                  }
                }

                onUpdate(currentEditor.getJSON(), true);
              })();
              return true; // 処理したのでデフォルトの動作を防ぐ
            }
            // 画像がない場合はデフォルトの動作に任せる
            return false;
          }

          // ファイルが貼り付けられた場合
          if (files.length > 0) {
            const pos = currentEditor.state.selection.anchor;
            void Promise.all(
              files.map((file) =>
                insertImageNode(file, pos, currentEditor, setIsImageInsert),
              ),
            )
              .then(() => {
                onUpdate(currentEditor.getJSON(), true);
              })
              .catch((error) => {
                console.error("画像の挿入中にエラーが発生しました:", error);
              });
            return true;
          }

          return false;
        },
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
      handleKeyDown: (_view, event) => {
        // Cmd+S / Ctrl+S で即時保存（手動更新）
        if (
          event.key?.toLowerCase() === "s" &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault();
          // 進行中の遅延更新があればキャンセルし、即時で更新
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
          }
          onUpdate(editor.getJSON(), true);
          return true;
        }
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

  // 親から呼び出せる補完リクエスト関数を登録
  useEffect(() => {
    if (!completionWithSubgraphRef) return;
    completionWithSubgraphRef.current = (
      subgraph: GraphDocumentForFrontend,
    ) => {
      if (!editor) return;
      textCompletion.requestCompletionWithSubgraph(editor, subgraph);
    };
    return () => {
      if (completionWithSubgraphRef) completionWithSubgraphRef.current = null;
    };
  }, [completionWithSubgraphRef, editor, textCompletion]);

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
                <div className="flex items-center space-x-1 rounded-md bg-slate-950/60 px-2 py-1 shadow-lg backdrop-blur-sm">
                  <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent"></div>
                  <span className="text-xs text-white">生成中...</span>
                </div>
              </div>
            )}
          {textCompletion.isTextSuggestionMode &&
            textCompletion.cursorPosition && (
              <div
                className="absolute z-10"
                style={{
                  left: `${textCompletion.cursorPosition.x}px`,
                  top: `${textCompletion.cursorPosition.y}px`,
                }}
              >
                <div className="flex items-center gap-1">
                  <Button
                    size="small"
                    className="flex !h-8 !w-8 items-center justify-center !bg-green-500/80 !p-1 backdrop-blur-sm"
                    onClick={() => {
                      // Enter確定と同様の処理
                      textCompletion.handleEnterKey(editor);
                    }}
                  >
                    <CheckIcon height={16} width={16} color="white" />
                  </Button>
                  <Button
                    size="small"
                    className="flex !h-8 !w-8 items-center justify-center !bg-red-500/80 !p-1 backdrop-blur-sm"
                    onClick={() => {
                      textCompletion.disableTextSuggestionMode(editor);
                    }}
                  >
                    <CrossLargeIcon height={16} width={16} color="white" />
                  </Button>
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
