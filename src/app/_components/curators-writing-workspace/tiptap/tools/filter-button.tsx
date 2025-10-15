import { Crosshair1Icon } from "@/app/_components/icons";
import { useContext } from "react";
import { TiptapGraphFilterContext } from "../..";
import type { Editor } from "@tiptap/core";
import { findEntityHighlights } from "@/app/_utils/text/find-entity-highlights";

const FilterButton = ({ editor }: { editor: Editor }) => {
  const { tiptapGraphFilterOption, setTiptapGraphFilterOption } = useContext(
    TiptapGraphFilterContext,
  );
  return (
    <button
      className="flex flex-row items-center gap-1 rounded-lg bg-black/75 p-2 backdrop-blur-sm"
      onClick={() => {
        const entities = findEntityHighlights(editor.getJSON().content);
        const names = entities.map((entity) => entity.name);

        setTiptapGraphFilterOption({
          entities: names,
          mode:
            tiptapGraphFilterOption.mode === "non-filtered"
              ? "focused"
              : tiptapGraphFilterOption.mode === "focused"
                ? "filtered"
                : "non-filtered",
        });
      }}
    >
      <div
        className={`text-xs ${
          tiptapGraphFilterOption.mode === "focused"
            ? "text-orange-300"
            : tiptapGraphFilterOption.mode === "filtered"
              ? "text-green-300"
              : "text-white"
        }`}
      >
        Focus
      </div>
      <Crosshair1Icon
        height={16}
        width={16}
        color={
          tiptapGraphFilterOption.mode === "focused"
            ? "orange"
            : tiptapGraphFilterOption.mode === "filtered"
              ? "lightgreen"
              : "white"
        }
      />
    </button>
  );
};

export default FilterButton;
