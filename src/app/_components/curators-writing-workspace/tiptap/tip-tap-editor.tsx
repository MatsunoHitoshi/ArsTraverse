"use client";
import { CustomNodeType } from "@/app/const/types";
import { TipTapEditorContent } from "./tip-tap-editor-content";
import { type JSONContent } from "@tiptap/react";
import React from "react";

interface TipTapEditorProps {
  content: JSONContent;
  onUpdate: (content: JSONContent) => void;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string) => void;
  workspaceId: string;
}

const TipTapEditor: React.FC<TipTapEditorProps> = (props) => {
  return <TipTapEditorContent {...props} />;
};

export default TipTapEditor;
