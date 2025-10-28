import React, { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MentionSuggestionContainer } from "./mention-suggestion-container";

interface MentionSuggestionOptions {
  items: Array<{ id: string; label: string }>;
  selectedIndex: number;
  onItemSelect: (item: { id: string; label: string }) => void;
  clientRect: () => DOMRect | null;
}

export const useMentionSuggestion = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<Root | null>(null);

  const show = (options: MentionSuggestionOptions) => {
    // 既存のコンテナをクリーンアップ
    if (containerRef.current && rootRef.current) {
      rootRef.current.unmount();
      document.body.removeChild(containerRef.current);
    }

    // 新しいコンテナを作成
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.zIndex = "50";
    document.body.appendChild(container);
    containerRef.current = container;

    // React ルートを作成してレンダリング
    const root = createRoot(container);
    rootRef.current = root;
    root.render(
      <MentionSuggestionContainer
        items={options.items}
        selectedIndex={options.selectedIndex}
        onItemSelect={options.onItemSelect}
        clientRect={options.clientRect}
      />,
    );
  };

  const hide = () => {
    if (containerRef.current && rootRef.current) {
      rootRef.current.unmount();
      document.body.removeChild(containerRef.current);
      containerRef.current = null;
      rootRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      hide();
    };
  }, []);

  return { show, hide };
};
