import React, { useEffect, useRef, useCallback, useState } from "react";
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
import {
  performTextCompletionSuggestion,
  confirmTextCompletion,
  clearAndDeleteTextCompletionMarks,
} from "@/app/_utils/tiptap/text-completion";
import { api } from "@/trpc/react";
import type { CustomNodeType } from "@/app/const/types";
import { TiptapEditorToolBar } from "./tools/tool-bar";
import { TeiCustomTagHighlightExtensions } from "./tei/tei-custom-tag-highlight-extension";

interface TipTapEditorContentProps {
  content: JSONContent;
  onUpdate: (content: JSONContent) => void;
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
        // const html = editor?.getHTML();
        // console.log("HTML: ", html);
        // console.log("converted body: ", TeiConverter.toTeiBody(html));
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
      ...TeiCustomTagHighlightExtensions,
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
        if (isTextSuggestionMode) {
          console.log("カーソル移動時にテキスト提案モードを無効化!!");
          disableTextSuggestionMode();
        }
      }, 100);
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
              // カーソル位置に一番近い3つのハイライト部分のエンティティを取得
              const cursorPos = editor.state.selection.from;

              // エディタのJSONからentityHighlightマークを探す
              const findEntityHighlights = (
                content: JSONContent[],
              ): Array<{ name: string; from: number; to: number }> => {
                const highlights: Array<{
                  name: string;
                  from: number;
                  to: number;
                }> = [];
                let position = 0;

                const traverse = (nodes: JSONContent[]) => {
                  for (const node of nodes) {
                    if (node.type === "text" && node.marks) {
                      for (const mark of node.marks) {
                        if (
                          mark.type === "entityHighlight" &&
                          mark.attrs?.entityName
                        ) {
                          highlights.push({
                            name: mark.attrs.entityName as string,
                            from: position,
                            to: position + (node.text?.length ?? 0),
                          });
                        }
                      }
                      position += node.text?.length ?? 0;
                    } else if (node.content) {
                      traverse(node.content);
                    }
                  }
                };

                traverse(content);
                return highlights;
              };

              const allHighlights = findEntityHighlights(
                editor.getJSON().content || [],
              );
              const nearbyEntities = allHighlights
                .map((highlight) => {
                  // カーソル位置からハイライト部分までの最小距離を計算
                  const distance = Math.min(
                    Math.abs(highlight.from - cursorPos),
                    Math.abs(highlight.to - cursorPos),
                    // カーソルがハイライト部分の範囲内にある場合は距離0
                    highlight.from <= cursorPos && highlight.to >= cursorPos
                      ? 0
                      : Infinity,
                  );
                  return { ...highlight, distance };
                })
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 3)
                .map((highlight) => highlight.name);

              console.log("nearbyEntities: ", nearbyEntities);

              textCompletion.mutate(
                {
                  workspaceId: workspaceId,
                  baseText: editor.getText(),
                  searchEntities: nearbyEntities,
                },
                {
                  onSuccess: (suggestion) => {
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
            } else {
              console.log("confirmTextCompletion");
              confirmTextCompletion(
                editor,
                isUpdatingTextCompletionSuggestionRef,
              );
              setIsTextSuggestionMode(false);
            }
          }

          return true; // イベントを処理したことを示す
        } else {
          // Tab以外のキーが押された場合、テキスト提案モードを無効化
          if (isTextSuggestionMode) {
            console.log("Tabキー以外が押された!!");
            disableTextSuggestionMode();
          }
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
      clearAndDeleteTextCompletionMarks(
        editor,
        isUpdatingTextCompletionSuggestionRef,
      );
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
    if (isTextSuggestionMode) {
      console.log(
        "テキスト提案モードがアクティブな場合、マウスクリックで無効化!!",
      );
      disableTextSuggestionMode();
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

          .ProseMirror span[data-entity-name].entity-highlight {
            cursor: pointer !important;
            transition: background-color 0.2s !important;
            display: inline-block !important;
            text-decoration: underline !important;
            text-decoration-style: dashed !important;
            text-underline-offset: 4px !important;
            text-decoration-thickness: 1px !important;
          }

          .ProseMirror span[data-entity-name].entity-highlight:hover {
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
    </div>
  );
};
