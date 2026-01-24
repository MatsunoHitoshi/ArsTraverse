"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

interface SortableItemProps {
  id: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function SortableItem({
  id,
  children,
  disabled = false,
  className,
  style,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  });

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    ...style,
  };

  return (
    <div
      ref={setNodeRef}
      style={!disabled && transform ? dragStyle : style}
      className={className}
      {...(disabled ? {} : { ...attributes, ...listeners })}
    >
      {children}
    </div>
  );
}
