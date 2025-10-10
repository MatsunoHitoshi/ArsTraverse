import type { Editor } from "@tiptap/core";
import ExportButton from "./export-button";
import FilterButton from "./filter-button";
import { TiptapEditorToolbar } from "./tiptap-editor-toolbar";

export const EditorToolBar = ({ editor }: { editor: Editor }) => {
  return (
    <div className="flex flex-row gap-2">
      <ExportButton editor={editor} />
      <FilterButton editor={editor} />
      <TiptapEditorToolbar editor={editor} />
    </div>
  );
};
