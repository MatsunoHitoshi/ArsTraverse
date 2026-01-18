"use client";

import { Button } from "@/app/_components/button/button";
import type { FilterCondition, LayoutInstruction } from "@/app/const/types";
import { FilterConditionEditor } from "./filter-condition-editor";

interface FilterSectionProps {
  filter: LayoutInstruction["filter"];
  localFilterConditions: Extract<FilterCondition, { type: "condition" }>[];
  onUpdateFilter: (updates: Partial<LayoutInstruction["filter"]>) => void;
  onAddCondition: () => void;
  onRemoveCondition: (index: number) => void;
  onUpdateCondition: (
    index: number,
    updates: Partial<Extract<FilterCondition, { type: "condition" }>>,
  ) => void;
  onApplyConditions: () => void;
}

export const FilterSection = ({
  filter,
  localFilterConditions,
  onUpdateFilter,
  onAddCondition,
  onRemoveCondition,
  onUpdateCondition,
  onApplyConditions,
}: FilterSectionProps) => {
  return (
    <div className="min-w-[400px] flex-1 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-300">
        フィルタ設定
      </h3>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            中心ノードID（カンマ区切り）
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
            placeholder="例: node1, node2"
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            最大ホップ数: {filter?.maxHops ?? 2}
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
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={filter?.includeNeighbors ?? true}
              onChange={(e) =>
                onUpdateFilter({ includeNeighbors: e.target.checked })
              }
              className="rounded border-slate-600 bg-slate-900"
            />
            隣接ノードを含める
          </label>
        </div>
        {/* フィルタ条件 */}
        <div className="w-full space-y-4 rounded-lg border border-slate-600 bg-slate-800/50 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-300">
              フィルタ条件
            </h4>
            <div className="flex gap-2">
              <Button size="small" onClick={onAddCondition} className="text-xs">
                条件を追加
              </Button>
              <Button
                size="small"
                onClick={onApplyConditions}
                className="text-xs bg-blue-600 hover:bg-blue-700"
              >
                反映
              </Button>
            </div>
          </div>
          {localFilterConditions.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-4">
              条件がありません。条件を追加してください。
            </div>
          ) : (
            <div className="space-y-3">
              {localFilterConditions.map((condition, index) => (
                <FilterConditionEditor
                  key={index}
                  condition={condition}
                  index={index}
                  onUpdate={onUpdateCondition}
                  onRemove={onRemoveCondition}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
