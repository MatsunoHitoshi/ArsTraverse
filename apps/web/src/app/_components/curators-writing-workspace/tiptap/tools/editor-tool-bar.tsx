import type { Editor } from "@tiptap/core";
import TeiExportButton from "./export-button";
import FilterButton from "./filter-button";
import { AIActivateButton } from "./ai-activate-button";
import { TiptapEditorToolbar } from "./tiptap-editor-toolbar";

export const EditorToolBar = ({
  editor,
  isAIAssistEnabled,
  setIsAIAssistEnabled,
}: {
  editor: Editor;
  isAIAssistEnabled: boolean;
  setIsAIAssistEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  return (
    <div className="flex flex-row gap-2">
      <TeiExportButton editor={editor} />
      <FilterButton editor={editor} />
      {/* <AIActivateButton
        editor={editor}
        isAIAssistEnabled={isAIAssistEnabled}
        setIsAIAssistEnabled={setIsAIAssistEnabled}
      /> */}
      <TiptapEditorToolbar editor={editor} />
    </div>
  );
};
