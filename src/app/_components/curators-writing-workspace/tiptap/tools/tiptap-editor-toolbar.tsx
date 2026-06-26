"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
  TextAlignRightIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignJustifyIcon,
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
  const t = useTranslations("workspace");
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
        title={t("toolbarBold")}
      >
        <BoldIcon
          height={16}
          width={16}
          color={editor.isActive("bold") ? "orange" : "white"}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title={t("toolbarItalic")}
      >
        <ItalicIcon
          height={16}
          width={16}
          color={editor.isActive("italic") ? "orange" : "white"}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title={t("toolbarUnderline")}
      >
        <UnderlineIcon
          height={16}
          width={16}
          color={editor.isActive("underline") ? "orange" : "white"}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title={t("toolbarBulletList")}
      >
        <ListBulletIcon
          height={16}
          width={16}
          color={editor.isActive("bulletList") ? "orange" : "white"}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title={t("toolbarOrderedList")}
      >
        <ListNumberIcon
          height={16}
          width={16}
          color={editor.isActive("orderedList") ? "orange" : "white"}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title={t("toolbarQuote")}
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
          title={t("toolbarHeading1")}
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
          title={t("toolbarHeading2")}
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
          title={t("toolbarHeading3")}
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
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title={t("toolbarAlignLeft")}
        >
          <TextAlignLeftIcon
            height={16}
            width={16}
            color={editor.isActive("textAlign", "left") ? "orange" : "white"}
          />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title={t("toolbarAlignCenter")}
        >
          <TextAlignCenterIcon
            height={16}
            width={16}
            color={editor.isActive("textAlign", "center") ? "orange" : "white"}
          />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title={t("toolbarAlignRight")}
        >
          <TextAlignRightIcon
            height={16}
            width={16}
            color={editor.isActive("textAlign", "right") ? "orange" : "white"}
          />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          title={t("toolbarAlignJustify")}
        >
          <TextAlignJustifyIcon
            height={16}
            width={16}
            color={editor.isActive("textAlign", "justify") ? "orange" : "white"}
          />
        </ToolbarButton>
      </div>

      <ToolbarButton
        onClick={toggleHighlightVisibility}
        title={isHighlightVisible ? t("toolbarHideHighlight") : t("toolbarShowHighlight")}
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
