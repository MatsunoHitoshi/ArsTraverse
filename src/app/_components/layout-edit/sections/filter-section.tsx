"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/app/_components/button/button";
import type { FilterCondition, LayoutInstruction } from "@/app/const/types";
import { FilterConditionEditorRecursive } from "./filter-condition-editor";

const DEFAULT_CONDITION: Extract<FilterCondition, { type: "condition" }> = {
  type: "condition",
  field: "label",
  operator: "equals",
  value: "",
};

interface FilterSectionProps {
  filter: LayoutInstruction["filter"];
  rootCondition: FilterCondition | undefined;
  showCenterNodesSettings?: boolean;
  showSegmentNodesOption?: boolean;
  onRootConditionChange: (condition: FilterCondition | undefined) => void;
  onUpdateFilter: (updates: Partial<LayoutInstruction["filter"]>) => void;
  onApplyConditions: () => void;
}

export const FilterSection = ({
  filter,
  rootCondition,
  onRootConditionChange,
  onUpdateFilter,
  onApplyConditions,
  showCenterNodesSettings = true,
  showSegmentNodesOption = false,
}: FilterSectionProps) => {
  const t = useTranslations("layoutEdit");

  const handleAddCondition = () => {
    if (!rootCondition) {
      onRootConditionChange({ ...DEFAULT_CONDITION });
      return;
    }
    if (rootCondition.type === "condition") {
      onRootConditionChange({
        type: "group",
        logic: "AND",
        conditions: [rootCondition, { ...DEFAULT_CONDITION }],
      });
      return;
    }
    onRootConditionChange({
      ...rootCondition,
      conditions: [...rootCondition.conditions, { ...DEFAULT_CONDITION }],
    });
  };

  return (
    <div className="min-w-[400px] flex-1 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-300">
        {t("filterSettings")}
      </h3>
      <div className="space-y-4">
        {showCenterNodesSettings && (
          <div className="flex flex-col w-full gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                {t("centerNodeIds")}
              </label>
              <input
                type="text"
                value={filter?.centerNodeIds?.join(", ") ?? ""}
                onChange={(e) => {
                  const nodeIds = e.target.value
                    .split(",")
                    .map((id) => id.trim())
                    .filter((id) => id.length > 0);
                  onUpdateFilter({
                    centerNodeIds: nodeIds.length > 0 ? nodeIds : undefined,
                  });
                }}
                placeholder={t("nodeIdsPlaceholderShort")}
                className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                {t("maxHops", { value: filter?.maxHops ?? 2 })}
              </label>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={filter?.maxHops ?? 2}
                onChange={(e) =>
                  onUpdateFilter({ maxHops: parseInt(e.target.value, 10) })
                }
                className="w-full"
              />
            </div>
          </div>
        )}
        <div className="w-full space-y-4 rounded-lg border border-slate-600 bg-slate-800/50 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-300">
              {t("filterConditions")}
            </h4>
            <div className="flex gap-2">
              <Button size="small" onClick={handleAddCondition} className="text-xs">
                {t("addCondition")}
              </Button>
              <Button
                size="small"
                onClick={onApplyConditions}
                className="text-xs bg-blue-600 hover:bg-blue-700"
              >
                {t("apply")}
              </Button>
            </div>
          </div>
          <div className="space-y-3 border-b border-slate-600 pb-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={filter?.includeNeighbors ?? true}
                onChange={(e) =>
                  onUpdateFilter({ includeNeighbors: e.target.checked })
                }
                className="rounded border-slate-600 bg-slate-900"
              />
              {t("includeNeighbors")}
            </label>
            {showSegmentNodesOption && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={filter?.includeSegmentNodes !== false}
                  onChange={(e) =>
                    onUpdateFilter({ includeSegmentNodes: e.target.checked })
                  }
                  className="rounded border-slate-600 bg-slate-900"
                />
                {t("includeSegmentNodes")}
              </label>
            )}
          </div>
          {!rootCondition ? (
            <div className="py-4 text-center text-xs text-slate-400">
              {t("noConditions")}
            </div>
          ) : (
            <FilterConditionEditorRecursive
              condition={rootCondition}
              onChange={onRootConditionChange}
              onRemove={() => onRootConditionChange(undefined)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
