"use client";
import type {
  CustomNodeType,
  GraphDocumentForFrontend,
} from "@/app/const/types";
import { TipTapEditorContent } from "./tip-tap-editor-content";
import { type JSONContent } from "@tiptap/react";
import React from "react";

interface TipTapEditorProps {
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

const TipTapEditor: React.FC<TipTapEditorProps> = (props) => {
  return <TipTapEditorContent {...props} />;
};

export default TipTapEditor;
