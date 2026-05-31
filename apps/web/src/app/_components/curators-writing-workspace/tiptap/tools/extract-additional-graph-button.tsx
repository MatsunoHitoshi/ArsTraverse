import React, { useState } from "react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/app/_components/button/button";
import { PlusIcon } from "@/app/_components/icons";
import { AdditionalGraphExtractionModal } from "./additional-graph-extraction-modal";
import type {
  CustomNodeType,
  GraphDocumentForFrontend,
} from "@/app/const/types";

interface ExtractAdditionalGraphButtonProps {
  editor: Editor | null;
  onGraphUpdate?: (additionalGraph: GraphDocumentForFrontend) => void;
  setIsGraphEditor: React.Dispatch<React.SetStateAction<boolean>>;
  entities: CustomNodeType[];
}

export const ExtractAdditionalGraphButton: React.FC<
  ExtractAdditionalGraphButtonProps
> = ({ editor, onGraphUpdate, setIsGraphEditor, entities }) => {
  const [
    isAdditionalGraphExtractionModalOpen,
    setIsAdditionalGraphExtractionModalOpen,
  ] = useState<boolean>(false);
  if (!editor) {
    return null;
  }
  const selectedText = editor.state.doc.textBetween(
    editor.state.selection.$from.pos,
    editor.state.selection.$to.pos,
  );

  return (
    <>
      <Button
        size="small"
        onClick={() => setIsAdditionalGraphExtractionModalOpen(true)}
        className={`flex h-8 items-center justify-center gap-1 p-0 text-xs`}
      >
        <PlusIcon height={16} width={16} color="white" />
        グラフ抽出
      </Button>

      <AdditionalGraphExtractionModal
        text={selectedText}
        isAdditionalGraphExtractionModalOpen={
          isAdditionalGraphExtractionModalOpen
        }
        setIsAdditionalGraphExtractionModalOpen={
          setIsAdditionalGraphExtractionModalOpen
        }
        onGraphUpdate={onGraphUpdate}
        setIsGraphEditor={setIsGraphEditor}
        entities={entities}
      />
    </>
  );
};
