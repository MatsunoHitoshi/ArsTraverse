import React from "react";
import type { CustomNodeType } from "@/app/const/types";
import {
  findEntityMatches,
  createHighlightSegments,
} from "@/app/_utils/text/highlight-entities";

interface HighlightedTextProps {
  text: string;
  entities: CustomNodeType[];
  onEntityClick?: (entityName: string, entityId: string) => void;
  className?: string;
  highlightClassName?: string;
  maxLength?: number;
  showEllipsis?: boolean;
}

export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  entities,
  onEntityClick,
  className = "",
  highlightClassName = "hover:bg-yellow-200 hover:text-yellow-950 px-1 rounded cursor-pointer underline decoration-dashed decoration-yellow-500 leading-normal",
  maxLength,
  showEllipsis = true,
}) => {
  // テキストの長さ制限
  const displayText =
    maxLength && text.length > maxLength ? text.substring(0, maxLength) : text;

  const shouldShowEllipsis =
    maxLength && text.length > maxLength && showEllipsis;

  // エンティティマッチを検索
  const matches = findEntityMatches(displayText, entities);

  // ハイライトセグメントを作成
  const segments = createHighlightSegments(displayText, matches);

  const handleEntityClick = (entityName: string, entityId: string) => {
    if (onEntityClick) {
      onEntityClick(entityName, entityId);
    }
  };

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (segment.isHighlight && segment.entityName) {
          return (
            <span
              key={index}
              className={highlightClassName}
              onClick={() =>
                handleEntityClick(segment.entityName!, segment.entityId!)
              }
              title={`${segment.entityName} (${
                segment.entityLabel ?? "Entity"
              })`}
            >
              {segment.text}
            </span>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
      {shouldShowEllipsis && <span>...</span>}
    </span>
  );
};
