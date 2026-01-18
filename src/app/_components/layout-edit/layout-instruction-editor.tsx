"use client";

import { useState, useEffect } from "react";
import type { LayoutInstruction, FilterCondition } from "@/app/const/types";
import { Button } from "../button/button";
import { CrossLargeIcon } from "../icons";
import { LayoutStrategySection } from "./sections/layout-strategy-section";
import { AxisForcesSection } from "./sections/axis-forces-section";
import { ChargeSection } from "./sections/charge-section";
import { FocusNodesSection } from "./sections/focus-nodes-section";
import { HighlightNodesSection } from "./sections/highlight-nodes-section";
import { CenterNodesSection } from "./sections/center-nodes-section";
import { FilterSection } from "./sections/filter-section";

interface LayoutInstructionEditorProps {
  layoutInstruction: LayoutInstruction | null;
  onUpdate: (instruction: LayoutInstruction) => void;
  setIsLayoutEditorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isLayoutEditorOpen: boolean;
}

export const LayoutInstructionEditor = ({
  layoutInstruction,
  onUpdate,
  setIsLayoutEditorOpen,
  isLayoutEditorOpen,
}: LayoutInstructionEditorProps) => {
  const [localInstruction, setLocalInstruction] = useState<LayoutInstruction>(
    layoutInstruction ?? { forces: {} },
  );

  // フィルタ条件をローカル状態で管理（反映ボタンを押すまで適用しない）
  const [localFilterConditions, setLocalFilterConditions] = useState<
    Extract<FilterCondition, { type: "condition" }>[]
  >(() => {
    const condition = layoutInstruction?.filter?.condition;
    if (condition?.type === "condition") {
      return [condition];
    } else if (condition?.type === "group") {
      // グループ条件の場合は、条件を展開（簡易版：最初のレベルのみ）
      return condition.conditions.filter(
        (c): c is Extract<FilterCondition, { type: "condition" }> =>
          c.type === "condition",
      );
    }
    return [];
  });

  // layoutInstructionが変更されたらローカル状態を更新
  useEffect(() => {
    if (layoutInstruction) {
      setLocalInstruction(layoutInstruction);
      // フィルタ条件も更新
      const condition = layoutInstruction.filter?.condition;
      if (condition?.type === "condition") {
        setLocalFilterConditions([condition]);
      } else if (condition?.type === "group") {
        setLocalFilterConditions(
          condition.conditions.filter(
            (c): c is Extract<FilterCondition, { type: "condition" }> =>
              c.type === "condition",
          ),
        );
      } else {
        setLocalFilterConditions([]);
      }
    }
  }, [layoutInstruction]);

  const updateForces = (updates: Partial<LayoutInstruction["forces"]>) => {
    const newInstruction: LayoutInstruction = {
      ...localInstruction,
      forces: {
        ...localInstruction.forces,
        ...updates,
      },
    };
    setLocalInstruction(newInstruction);
    onUpdate(newInstruction);
  };

  const updateXAxis = (
    updates: Partial<NonNullable<LayoutInstruction["forces"]>["x_axis"]>,
  ) => {
    const currentXAxis = localInstruction.forces?.x_axis;
    updateForces({
      x_axis: currentXAxis
        ? { ...currentXAxis, ...updates }
        : (updates as NonNullable<LayoutInstruction["forces"]>["x_axis"]),
    });
  };

  const updateYAxis = (
    updates: Partial<NonNullable<LayoutInstruction["forces"]>["y_axis"]>,
  ) => {
    const currentYAxis = localInstruction.forces?.y_axis;
    updateForces({
      y_axis: currentYAxis
        ? { ...currentYAxis, ...updates }
        : (updates as NonNullable<LayoutInstruction["forces"]>["y_axis"]),
    });
  };

  const updateCharge = (
    updates: Partial<NonNullable<LayoutInstruction["forces"]>["charge"]>,
  ) => {
    const currentCharge = localInstruction.forces?.charge;
    updateForces({
      charge: currentCharge
        ? { ...currentCharge, ...updates }
        : (updates as NonNullable<LayoutInstruction["forces"]>["charge"]),
    });
  };

  const updateLayoutStrategy = (strategy: string) => {
    const newInstruction: LayoutInstruction = {
      ...localInstruction,
      layout_strategy: strategy || undefined,
    };
    setLocalInstruction(newInstruction);
    onUpdate(newInstruction);
  };

  const updateFilter = (updates: Partial<LayoutInstruction["filter"]>) => {
    const newInstruction: LayoutInstruction = {
      ...localInstruction,
      filter: {
        ...localInstruction.filter,
        ...updates,
      },
    };
    setLocalInstruction(newInstruction);
    onUpdate(newInstruction);
  };

  // フィルタ条件を反映する（反映ボタンが押された時）
  const applyFilterConditions = () => {
    let condition: FilterCondition | undefined;
    if (localFilterConditions.length === 0) {
      condition = undefined;
    } else if (localFilterConditions.length === 1) {
      condition = localFilterConditions[0];
    } else {
      // 複数条件の場合はグループ条件として結合
      condition = {
        type: "group",
        logic: "AND",
        conditions: localFilterConditions,
      };
    }
    updateFilter({ condition });
  };

  // 条件を追加
  const addFilterCondition = () => {
    setLocalFilterConditions([
      ...localFilterConditions,
      {
        type: "condition",
        field: "label",
        operator: "equals",
        value: "",
      },
    ]);
  };

  // 条件を削除
  const removeFilterCondition = (index: number) => {
    setLocalFilterConditions(
      localFilterConditions.filter((_, i) => i !== index),
    );
  };

  // 条件を更新
  const updateFilterCondition = (
    index: number,
    updates: Partial<Extract<FilterCondition, { type: "condition" }>>,
  ) => {
    setLocalFilterConditions(
      localFilterConditions.map((cond, i) =>
        i === index ? { ...cond, ...updates } : cond,
      ),
    );
  };

  // JSON文字列をRecord<string, string | number>に安全に変換するヘルパー関数
  const parseGroupsJson = (
    jsonString: string,
  ): Record<string, string | number> | null => {
    try {
      const parsed = JSON.parse(jsonString) as unknown;
      // 型チェック: Record<string, string | number>であることを確認
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, string | number>;
      }
    } catch {
      // 無効なJSONの場合は無視
    }
    return null;
  };

  // layoutInstructionがnullの場合でも、空のレイアウト指示を表示
  const displayInstruction = layoutInstruction ?? localInstruction;

  return (
    <div className="border-t border-slate-700 bg-slate-800/50 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-slate-700 px-2">
        <h2 className="text-sm font-semibold text-slate-200">
          レイアウト指示エディタ
        </h2>
        <Button
          size="small"
          onClick={() => setIsLayoutEditorOpen(!isLayoutEditorOpen)}
          className="flex items-center gap-2 bg-transparent hover:bg-slate-700"
        >
          <CrossLargeIcon width={16} height={16} color="white" />
        </Button>
      </div>

      <div className="max-h-72 overflow-y-auto">
        <div className="flex h-full flex-col overflow-y-auto p-4">
          <div className="flex flex-wrap gap-4">
            <LayoutStrategySection
              layoutStrategy={displayInstruction.layout_strategy}
              onUpdate={updateLayoutStrategy}
            />

            <AxisForcesSection
              xAxis={displayInstruction.forces?.x_axis}
              yAxis={displayInstruction.forces?.y_axis}
              onUpdateXAxis={updateXAxis}
              onUpdateYAxis={updateYAxis}
              parseGroupsJson={parseGroupsJson}
            />

            <ChargeSection
              strength={displayInstruction.forces?.charge?.strength}
              onUpdate={(strength) => updateCharge({ strength })}
            />

            <FocusNodesSection
              targetNodeIds={
                displayInstruction.forces?.focus_nodes?.targetNodeIds ?? []
              }
              chargeMultiplier={
                displayInstruction.forces?.focus_nodes?.chargeMultiplier
              }
              onUpdate={(targetNodeIds, chargeMultiplier) => {
                updateForces({
                  focus_nodes:
                    targetNodeIds.length > 0
                      ? { targetNodeIds, chargeMultiplier }
                      : undefined,
                });
              }}
            />

            <HighlightNodesSection
              targetNodeIds={
                displayInstruction.forces?.highlight_nodes?.targetNodeIds ?? []
              }
              color={displayInstruction.forces?.highlight_nodes?.color}
              onUpdate={(targetNodeIds, color) => {
                updateForces({
                  highlight_nodes:
                    targetNodeIds.length > 0
                      ? { targetNodeIds, color }
                      : undefined,
                });
              }}
            />

            <CenterNodesSection
              targetNodeIds={
                displayInstruction.forces?.center_nodes?.targetNodeIds ?? []
              }
              onUpdate={(targetNodeIds) => {
                updateForces({
                  center_nodes:
                    targetNodeIds.length > 0 ? { targetNodeIds } : undefined,
                });
              }}
            />

            <FilterSection
              filter={displayInstruction.filter}
              localFilterConditions={localFilterConditions}
              onUpdateFilter={updateFilter}
              onAddCondition={addFilterCondition}
              onRemoveCondition={removeFilterCondition}
              onUpdateCondition={updateFilterCondition}
              onApplyConditions={applyFilterConditions}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
