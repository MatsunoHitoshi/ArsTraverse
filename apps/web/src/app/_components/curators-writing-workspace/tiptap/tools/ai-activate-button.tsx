"use client";

import React from "react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/app/_components/button/button";
import { StarIcon } from "@/app/_components/icons";

interface AIActivateButtonProps {
  editor: Editor | null;
  isAIAssistEnabled: boolean;
  setIsAIAssistEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export const AIActivateButton: React.FC<AIActivateButtonProps> = ({
  editor,
  isAIAssistEnabled,
  setIsAIAssistEnabled,
}) => {
  if (!editor) {
    return null;
  }

  return (
    <Button
      size="small"
      onClick={() => setIsAIAssistEnabled(!isAIAssistEnabled)}
      className={`flex h-8 w-8 items-center justify-center p-0`}
    >
      <StarIcon
        height={16}
        width={16}
        color={isAIAssistEnabled ? "white" : "orange"}
      />
    </Button>
  );
};
