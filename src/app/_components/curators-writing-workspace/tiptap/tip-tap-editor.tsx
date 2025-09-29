"use client";
import type { CustomNodeType } from "@/app/const/types";
import { TipTapEditorContent } from "./tip-tap-editor-content";
import { type JSONContent } from "@tiptap/react";
import React from "react";

interface TipTapEditorProps {
  content: JSONContent;
  onUpdate: (content: JSONContent, updateAllowed: boolean) => void;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string) => void;
  workspaceId: string;
}

const TipTapEditor: React.FC<TipTapEditorProps> = (props) => {
  return <TipTapEditorContent {...props} />;
};

export default TipTapEditor;
