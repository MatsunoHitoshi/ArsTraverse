import { useRef, useEffect } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { EntityHighlight } from "../curators-writing-workspace/tiptap/extensions/entity-highlight-extension";
import type { CustomNodeType } from "@/app/const/types";
import TextAlign from "@tiptap/extension-text-align";
import { useHighlight } from "../curators-writing-workspace/tiptap/hooks/use-highlight";
import {
  HighlightVisibilityProvider,
  useHighlightVisibility,
} from "../curators-writing-workspace/tiptap/contexts/highlight-visibility-context";
import { ResizableImage } from "../curators-writing-workspace/tiptap/extensions/resizable-image-extension";
import { TiptapStyles } from "../curators-writing-workspace/tiptap/styles/tiptap-styles";
import { TeiCustomTagHighlightExtensions } from "../curators-writing-workspace/tiptap/tei/tei-custom-tag-highlight-extension";
import { useHighlightToggle } from "../curators-writing-workspace/tiptap/hooks/use-highlight-toggle";
import { TeiStyles } from "../curators-writing-workspace/tiptap/tei/tei-styles";

interface ReadOnlyTipTapViewerProps {
  content: JSONContent;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string) => void;
  isHighlightVisible?: boolean;
}

export const ReadOnlyTipTapViewer: React.FC<ReadOnlyTipTapViewerProps> = ({
  content,
  entities,
  onEntityClick,
  isHighlightVisible = true,
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
  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  const { editorRef: highlightEditorRef, triggerHighlightUpdate } = highlight;

  // エディタが初期化されたらハイライトを設定
  useEffect(() => {
    if (editor) {
      highlightEditorRef.current = editor;
    }
  }, [editor, highlightEditorRef]);

  useEffect(() => {
    if (!editor || entities.length === 0) return;
    const timer = setTimeout(() => {
      triggerHighlightUpdate();
    }, 500);
    return () => clearTimeout(timer);
  }, [editor, entities, triggerHighlightUpdate]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editor || !onEntityClick) return;
    highlight.handleHighlightClick(e);
  };

  if (!editor) {
    return <div className="text-gray-400">読み込み中...</div>;
  }

  return (
    <HighlightVisibilityProvider initialValue={isHighlightVisible}>
      <HighlightVisibilityController isHighlightVisible={isHighlightVisible} />
      <div className="relative flex h-full flex-col">
        <div className="h-full overflow-y-auto">
          <EditorContent
            ref={editorRef}
            editor={editor}
            className="h-full min-h-[200px] overflow-y-scroll text-white focus-within:outline-none"
            onClick={handleClick}
          />
        </div>
        <TiptapStyles highlightHoverEffect={false} isReadOnly={true} />
        <TeiStyles />
      </div>
    </HighlightVisibilityProvider>
  );
};

const HighlightVisibilityController: React.FC<{
  isHighlightVisible: boolean;
}> = ({ isHighlightVisible }) => {
  const { isHighlightVisible: currentValue, setHighlightVisibility } =
    useHighlightVisibility();

  // useHighlightToggleを呼び出してCSSクラスを適用
  useHighlightToggle();

  useEffect(() => {
    // 現在の状態と異なる場合のみ更新
    if (currentValue !== isHighlightVisible) {
      setHighlightVisibility(isHighlightVisible);
    }
  }, [isHighlightVisible, currentValue, setHighlightVisibility]);

  return null;
};
