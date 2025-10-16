"use client";

import { useState, useEffect } from "react";

interface EditableTitleProps {
  title: string;
  onSave: (newTitle: string) => void;
  onCancel?: () => void;
  isPending?: boolean;
  className?: string;
  titleClassName?: string;
  inputClassName?: string;
}

export const EditableTitle = ({
  title,
  onSave,
  onCancel,
  isPending = false,
  className = "",
  titleClassName = "cursor-pointer text-lg font-semibold text-gray-400 hover:text-white",
  inputClassName = "bg-transparent text-lg font-semibold text-gray-400 outline-none focus:text-white disabled:opacity-50",
}: EditableTitleProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(title);
  const [isComposing, setIsComposing] = useState(false);

  // titleが更新されたらeditingTitleも更新
  useEffect(() => {
    setEditingTitle(title);
  }, [title]);

  const handleEdit = (currentTitle: string) => {
    setIsEditing(true);
    setEditingTitle(currentTitle);
  };

  const handleSave = () => {
    if (editingTitle.trim() !== title) {
      onSave(editingTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingTitle(title);
    onCancel?.();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isComposing) {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  if (isEditing) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <input
          type="text"
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyPress}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          disabled={isPending}
          className={inputClassName}
          autoFocus
        />
        {isPending && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
        )}
      </div>
    );
  }

  return (
    <h2
      className={`${titleClassName} ${className}`}
      onClick={() => handleEdit(title)}
      title="クリックして編集"
    >
      {title}
    </h2>
  );
};
