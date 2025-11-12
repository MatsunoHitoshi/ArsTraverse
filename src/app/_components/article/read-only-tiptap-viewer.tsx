import React, { useRef } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { EntityHighlight } from "../curators-writing-workspace/tiptap/extensions/entity-highlight-extension";
import type { CustomNodeType } from "@/app/const/types";
import TextAlign from "@tiptap/extension-text-align";
import { useHighlight } from "../curators-writing-workspace/tiptap/hooks/use-highlight";
import { HighlightVisibilityProvider } from "../curators-writing-workspace/tiptap/contexts/highlight-visibility-context";
import { ResizableImage } from "../curators-writing-workspace/tiptap/extensions/resizable-image-extension";
import { TiptapStyles } from "../curators-writing-workspace/tiptap/styles";
import { TeiCustomTagHighlightExtensions } from "../curators-writing-workspace/tiptap/tei/tei-custom-tag-highlight-extension";

interface ReadOnlyTipTapViewerProps {
  content: JSONContent;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string) => void;
}

export const ReadOnlyTipTapViewer: React.FC<ReadOnlyTipTapViewerProps> = ({
  content,
  entities,
  onEntityClick,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);

  // ハイライト処理用のカスタムフック
  const highlight = useHighlight({
    editor: null,
    entities,
    onEntityClick,
    isTextSuggestionMode: false,
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      EntityHighlight,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      ResizableImage,
      ...TeiCustomTagHighlightExtensions,
    ],
    content,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none",
      },
    },
    immediatelyRender: false,
  });

  // エディタが初期化されたらコンテンツを設定（immediatelyRender: falseの場合に必要）
  React.useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  // エディタが初期化されたらハイライトを設定
  React.useEffect(() => {
    if (editor) {
      highlight.editorRef.current = editor;
      // エディタが設定されたらハイライト処理を手動でトリガー
      setTimeout(() => {
        highlight.triggerHighlightOnEditorSet();
      }, 500);
    }
  }, [editor, highlight]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editor || !onEntityClick) return;
    highlight.handleHighlightClick(e);
  };

  if (!editor) {
    return <div className="text-gray-400">読み込み中...</div>;
  }

  return (
    <HighlightVisibilityProvider>
      <div className="relative flex h-full flex-col">
        <div className="h-full overflow-y-auto">
          <EditorContent
            ref={editorRef}
            editor={editor}
            className="h-full min-h-[200px] overflow-y-scroll text-white focus-within:outline-none"
            onClick={handleClick}
          />
        </div>
        <TiptapStyles highlightHoverEffect={false} />
      </div>
    </HighlightVisibilityProvider>
  );
};
