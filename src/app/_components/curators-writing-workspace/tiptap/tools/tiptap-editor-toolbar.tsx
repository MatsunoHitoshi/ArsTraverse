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
  BorderDashedIcon,
} from "@/app/_components/icons";
import { useHighlightToggle } from "../hooks/use-highlight-toggle";

interface TiptapEditorToolbarProps {
  editor: Editor | null;
  className?: string;
}

export const TiptapEditorToolbar: React.FC<TiptapEditorToolbarProps> = ({
  editor,
  className,
}) => {
  const { isHighlightVisible, toggleHighlightVisibility } =
    useHighlightToggle();

  if (!editor) {
    return null;
  }

  const ToolbarButton = ({
    onClick,
    disabled = false,
    children,
  }: {
    onClick: () => void;
    children: React.ReactNode;
    title: string;
    disabled?: boolean;
  }) => (
    <Button
      size="small"
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 flex-row items-center justify-center p-0"
    >
      {children}
    </Button>
  );

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="太字"
      >
        <BoldIcon
          height={16}
          width={16}
          color={editor.isActive("bold") ? "orange" : "white"}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="斜体"
      >
        <ItalicIcon
          height={16}
          width={16}
          color={editor.isActive("italic") ? "orange" : "white"}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="下線"
      >
        <UnderlineIcon
          height={16}
          width={16}
          color={editor.isActive("underline") ? "orange" : "white"}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="箇条書き"
      >
        <ListBulletIcon
          height={16}
          width={16}
          color={editor.isActive("bulletList") ? "orange" : "white"}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="番号付きリスト"
      >
        <ListNumberIcon
          height={16}
          width={16}
          color={editor.isActive("orderedList") ? "orange" : "white"}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="引用"
      >
        <QuoteIcon
          height={16}
          width={16}
          color={editor.isActive("blockquote") ? "orange" : "white"}
        />
      </ToolbarButton>

      {/* 見出しボタン */}
      <div className="flex items-center gap-1 border-l border-gray-600 pl-2">
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          title="見出し1"
        >
          <span
            className={`text-xs font-bold ${
              editor.isActive("heading", { level: 1 })
                ? "text-orange-400"
                : "text-white"
            }`}
          >
            H1
          </span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          title="見出し2"
        >
          <span
            className={`text-xs font-bold ${
              editor.isActive("heading", { level: 2 })
                ? "text-orange-400"
                : "text-white"
            }`}
          >
            H2
          </span>
        </ToolbarButton>

        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          title="見出し3"
        >
          <span
            className={`text-xs font-bold ${
              editor.isActive("heading", { level: 3 })
                ? "text-orange-400"
                : "text-white"
            }`}
          >
            H3
          </span>
        </ToolbarButton>
      </div>

      <ToolbarButton
        onClick={toggleHighlightVisibility}
        title={isHighlightVisible ? "ハイライトを隠す" : "ハイライトを表示"}
      >
        <BorderDashedIcon
          height={16}
          width={16}
          color={isHighlightVisible ? "orange" : "white"}
        />
      </ToolbarButton>
    </div>
  );
};
