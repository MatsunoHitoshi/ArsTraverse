import React from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import { TiptapEditorToolbar } from "./tiptap-editor-toolbar";
import { ExtractAdditionalGraphButton } from "./extract-additional-graph-button";
import { CustomNodeType, GraphDocumentForFrontend } from "@/app/const/types";

interface BubbleMenuProps {
  editor: Editor;
  onGraphUpdate?: (additionalGraph: GraphDocumentForFrontend) => void;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
  entities: CustomNodeType[];
}

export const CustomBubbleMenu: React.FC<BubbleMenuProps> = ({
  editor,
  onGraphUpdate,
  setIsGraphEditor,
  entities,
}) => {
  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: "top-start",
        offset: 20,
      }}
      className="flex items-center gap-1 rounded-md bg-slate-950/75 p-2 shadow-lg backdrop-blur-sm duration-100"
    >
      <ExtractAdditionalGraphButton
        editor={editor}
        onGraphUpdate={onGraphUpdate}
        setIsGraphEditor={setIsGraphEditor}
        entities={entities}
      />
      <TiptapEditorToolbar editor={editor} />
    </BubbleMenu>
  );
};
