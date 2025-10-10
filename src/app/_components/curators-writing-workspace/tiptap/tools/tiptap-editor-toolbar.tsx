"use client";

import React from "react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/app/_components/button/button";
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  ListBulletIcon,
  ListNumberIcon,
  QuoteIcon,
} from "@/app/_components/icons";

interface TiptapEditorToolbarProps {
  editor: Editor | null;
  className?: string;
}

export const TiptapEditorToolbar: React.FC<TiptapEditorToolbarProps> = ({
  editor,
  className,
}) => {
  if (!editor) {
    return null;
  }

  const ToolbarButton = ({
    onClick,
    isActive = false,
    children,
  }: {
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <Button
      size="small"
      disabled={isActive}
      onClick={onClick}
      className="h-8 w-8 p-0"
    >
      {children}
    </Button>
  );

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="太字"
      >
        <BoldIcon height={16} width={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="斜体"
      >
        <ItalicIcon height={16} width={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        title="下線"
      >
        <UnderlineIcon height={16} width={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="箇条書き"
      >
        <ListBulletIcon height={16} width={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="番号付きリスト"
      >
        <ListNumberIcon height={16} width={16} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title="引用"
      >
        <QuoteIcon height={16} width={16} />
      </ToolbarButton>
    </div>
  );
};
