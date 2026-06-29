import React from "react";
import { useTranslations } from "next-intl";

interface MentionSuggestionItem {
  id: string;
  label: string;
}

interface MentionSuggestionListProps {
  items: MentionSuggestionItem[];
  selectedIndex: number;
  onItemClick: (item: MentionSuggestionItem) => void;
}

export const MentionSuggestionList: React.FC<MentionSuggestionListProps> = ({
  items,
  selectedIndex,
  onItemClick,
}) => {
  const t = useTranslations("workspace");
  if (items.length === 0) {
    return (
      <div className="px-3 py-2 text-sm text-gray-400">
        {t("noMentionCandidates")}
      </div>
    );
  }

  const handleItemClick = (item: MentionSuggestionItem) => {
    if (typeof onItemClick === "function") {
      onItemClick(item);
    }
  };

  return (
    <ul className="m-0 list-none p-0">
      {items.map((item, index) => (
        <li
          key={item.id}
          className={`mention-suggestion-item ${
            index === selectedIndex ? "bg-slate-700" : "hover:bg-slate-700"
          } cursor-pointer px-3 py-2 text-white`}
          onClick={() => handleItemClick(item)}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
};
