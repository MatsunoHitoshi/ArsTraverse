"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ReactNode } from "react";

export type SortableListStrategy = "vertical" | "horizontal";

interface SortableListProps<T extends { id: string }> {
  items: T[];
  onDragEnd: (event: { activeId: string; overId: string; oldIndex: number; newIndex: number }) => void;
  children: (item: T, index: number) => ReactNode;
  strategy?: SortableListStrategy;
  disabled?: boolean;
  className?: string;
  emptyMessage?: ReactNode;
}

export function SortableList<T extends { id: string }>({
  items,
  onDragEnd,
  children,
  strategy = "vertical",
  disabled = false,
  className,
  emptyMessage,
}: SortableListProps<T>) {
  // ドラッグアンドドロップ用のセンサー
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ドラッグ終了時のハンドラー
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (disabled || !over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onDragEnd({
        activeId: active.id as string,
        overId: over.id as string,
        oldIndex,
        newIndex,
      });
    }
  };

  const sortingStrategy =
    strategy === "horizontal" ? horizontalListSortingStrategy : verticalListSortingStrategy;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={sortingStrategy}
        disabled={disabled}
      >
        <div className={className}>
          {items.length === 0 && emptyMessage ? (
            <div>{emptyMessage}</div>
          ) : (
            items.map((item, index) => (
              <div key={item.id}>
                {children(item, index)}
              </div>
            ))
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
