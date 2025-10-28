import React, { useEffect, useRef, useCallback } from "react";
import { MentionSuggestionList } from "./mention-suggestion-list";

interface MentionSuggestionItem {
  id: string;
  label: string;
}

interface MentionSuggestionContainerProps {
  items: MentionSuggestionItem[];
  selectedIndex: number;
  onItemSelect: (item: MentionSuggestionItem) => void;
  clientRect: () => DOMRect | null;
}

export const MentionSuggestionContainer: React.FC<
  MentionSuggestionContainerProps
> = ({ items, selectedIndex, onItemSelect, clientRect }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const rect = clientRect();
    if (rect && containerRef.current) {
      const container = containerRef.current;
      const scrollTop = document.documentElement.scrollTop;
      const scrollLeft = document.documentElement.scrollLeft;

      container.style.top = `${rect.bottom + scrollTop + 4}px`;
      container.style.left = `${rect.left + scrollLeft}px`;
    }
  }, [clientRect]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("scroll", updatePosition);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition]);

  useEffect(() => {
    updatePosition();
  }, [updatePosition]);

  return (
    <div
      ref={containerRef}
      className="fixed z-50 max-h-60 min-w-[200px] overflow-auto rounded-md border border-slate-600 bg-slate-800 shadow-lg"
    >
      <MentionSuggestionList
        items={items}
        selectedIndex={selectedIndex}
        onItemClick={onItemSelect}
      />
    </div>
  );
};
