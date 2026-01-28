"use client";

import { Button } from "@/app/_components/button/button";
import { PlusIcon, TrashIcon } from "@/app/_components/icons";
import type { FilterCondition } from "@/app/const/types";

const DEFAULT_CONDITION: Extract<FilterCondition, { type: "condition" }> = {
  type: "condition",
  field: "label",
  operator: "equals",
  value: "",
};

interface FilterConditionLeafEditorProps {
  condition: Extract<FilterCondition, { type: "condition" }>;
  index: number;
  onUpdate: (
    index: number,
    updates: Partial<Extract<FilterCondition, { type: "condition" }>>,
  ) => void;
  onRemove: (index: number) => void;
}

/** 単一条件（リーフ）の編集UI */
export const FilterConditionLeafEditor = ({
  condition,
  index,
  onUpdate,
  onRemove,
}: FilterConditionLeafEditorProps) => {
  return (
    <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-300">
          条件 {index + 1}
        </span>
        <Button
          size="small"
          onClick={() => onRemove(index)}
          className="text-xs text-red-400 hover:text-red-300"
        >
          削除
        </Button>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-400">フィールド</label>
        <div className="flex gap-2">
          <select
            value={
              condition.field === "label" || condition.field === "name"
                ? condition.field
                : "custom"
            }
            onChange={(e) => {
              if (e.target.value === "custom") {
                onUpdate(index, { field: "" });
              } else {
                onUpdate(index, { field: e.target.value as "label" | "name" });
              }
            }}
            className="w-32 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
          >
            <option value="label">ラベル</option>
            <option value="name">名前</option>
            <option value="custom">カスタム</option>
          </select>
          {condition.field !== "label" && condition.field !== "name" ? (
            <input
              type="text"
              value={
                condition.field === "label" || condition.field === "name"
                  ? ""
                  : condition.field
              }
              onChange={(e) => onUpdate(index, { field: e.target.value })}
              placeholder="プロパティ名（例: mentionedAt）"
              className="flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
            />
          ) : null}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-400">演算子</label>
        <select
          value={condition.operator}
          onChange={(e) => {
            const operator = e.target.value as
              | "equals"
              | "in"
              | "contains"
              | "date_equals"
              | "date_after"
              | "date_before"
              | "date_range";
            onUpdate(index, {
              operator,
              value:
                operator === "in"
                  ? [""]
                  : operator === "date_range"
                    ? { from: "", to: "" }
                    : "",
            });
          }}
          className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
        >
          <option value="equals">完全一致</option>
          <option value="in">含まれる</option>
          <option value="contains">部分一致</option>
          <option value="date_equals">日付完全一致</option>
          <option value="date_after">日付以降</option>
          <option value="date_before">日付以前</option>
          <option value="date_range">日付範囲</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-400">値</label>
        {condition.operator === "in" ? (
          <div className="space-y-2">
            {(Array.isArray(condition.value) ? condition.value : []).length ===
              0 ? (
              <div className="text-xs text-slate-500">
                値を追加してください
              </div>
            ) : null}
            {(Array.isArray(condition.value) ? condition.value : []).map(
              (item, valueIndex) => (
                <div
                  key={valueIndex}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => {
                      const current = Array.isArray(condition.value)
                        ? condition.value
                        : [];
                      const next = [...current];
                      next[valueIndex] = e.target.value;
                      onUpdate(index, { value: next });
                    }}
                    placeholder="値（例: Person）"
                    className="flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
                  />
                  <Button
                    size="small"
                    onClick={() => {
                      const current = Array.isArray(condition.value)
                        ? condition.value
                        : [];
                      const next = current.filter(
                        (_: string, i: number) => i !== valueIndex,
                      );
                      onUpdate(index, { value: next });
                    }}
                    className="flex !h-8 !w-8 shrink-0 items-center justify-center !p-0 text-red-400 hover:text-red-300"
                    aria-label="この値を削除"
                  >
                    <TrashIcon width={14} height={14} />
                  </Button>
                </div>
              ),
            )}
            <Button
              size="small"
              onClick={() => {
                const current = Array.isArray(condition.value)
                  ? condition.value
                  : [];
                onUpdate(index, { value: [...current, ""] });
              }}
              className="flex items-center gap-1 text-xs"
            >
              <PlusIcon width={14} height={14} />
              値を追加
            </Button>
          </div>
        ) : condition.operator === "date_range" ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={
                typeof condition.value === "object" &&
                  !Array.isArray(condition.value) &&
                  "from" in condition.value
                  ? condition.value.from
                  : ""
              }
              onChange={(e) => {
                const currentValue = condition.value;
                if (
                  typeof currentValue === "object" &&
                  !Array.isArray(currentValue) &&
                  "to" in currentValue
                ) {
                  onUpdate(index, {
                    value: {
                      from: e.target.value,
                      to: currentValue.to,
                    },
                  });
                }
              }}
              placeholder="開始日（例: 2024-01-01）"
              className="flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
            />
            <input
              type="text"
              value={
                typeof condition.value === "object" &&
                  !Array.isArray(condition.value) &&
                  "to" in condition.value
                  ? condition.value.to
                  : ""
              }
              onChange={(e) => {
                const currentValue = condition.value;
                if (
                  typeof currentValue === "object" &&
                  !Array.isArray(currentValue) &&
                  "from" in currentValue
                ) {
                  onUpdate(index, {
                    value: {
                      from: currentValue.from,
                      to: e.target.value,
                    },
                  });
                }
              }}
              placeholder="終了日（例: 2024-12-31）"
              className="flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
            />
          </div>
        ) : (
          <input
            type="text"
            value={typeof condition.value === "string" ? condition.value : ""}
            onChange={(e) => onUpdate(index, { value: e.target.value })}
            placeholder="値を入力"
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
          />
        )}
      </div>
    </div>
  );
};

interface FilterConditionEditorRecursiveProps {
  condition: FilterCondition;
  onChange: (condition: FilterCondition) => void;
  onRemove: () => void;
  depth?: number;
}

/** 条件またはグループを再帰的に編集するUI（AND/OR対応） */
export const FilterConditionEditorRecursive = ({
  condition,
  onChange,
  onRemove,
  depth = 0,
}: FilterConditionEditorRecursiveProps) => {
  if (condition.type === "group") {
    const updateLogic = (logic: "AND" | "OR") => {
      onChange({ ...condition, logic });
    };
    const updateChild = (index: number, newChild: FilterCondition) => {
      const newConditions = [...condition.conditions];
      newConditions[index] = newChild;
      onChange({ ...condition, conditions: newConditions });
    };
    const removeChild = (index: number) => {
      const newConditions = condition.conditions.filter((_, i) => i !== index);
      if (newConditions.length === 0) {
        onRemove();
        return;
      }
      if (newConditions.length === 1) {
        onChange(newConditions[0]!);
        return;
      }
      onChange({ ...condition, conditions: newConditions });
    };
    const addChild = () => {
      onChange({
        ...condition,
        conditions: [...condition.conditions, { ...DEFAULT_CONDITION }],
      });
    };

    return (
      <div
        className="space-y-3 rounded-lg border border-slate-600 bg-slate-600 p-3"
        style={{ marginLeft: depth > 0 ? 12 : 0 }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-400">グループ</span>
          <div className="flex items-center gap-2">
            <select
              value={condition.logic}
              onChange={(e) =>
                updateLogic(e.target.value as "AND" | "OR")
              }
              className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200"
            >
              <option value="AND">AND（すべて一致）</option>
              <option value="OR">OR（いずれか一致）</option>
            </select>
            <Button
              size="small"
              onClick={onRemove}
              className="text-xs text-red-400 hover:text-red-300"
            >
              グループ削除
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {condition.conditions.map((child, index) => (
            <FilterConditionEditorRecursive
              key={index}
              condition={child}
              onChange={(c) => updateChild(index, c)}
              onRemove={() => removeChild(index)}
              depth={depth + 1}
            />
          ))}
        </div>
        <Button size="small" onClick={addChild} className="text-xs">
          条件を追加
        </Button>
      </div>
    );
  }

  // type === "condition"
  const leafCondition = condition;
  const updateLeaf = (
    updates: Partial<Extract<FilterCondition, { type: "condition" }>>,
  ) => {
    onChange({ ...leafCondition, ...updates });
  };

  return (
    <div style={{ marginLeft: depth > 0 ? 12 : 0 }}>
      <FilterConditionLeafEditor
        condition={leafCondition}
        index={0}
        onUpdate={(_, updates) => updateLeaf(updates)}
        onRemove={(_index) => onRemove()}
      />
    </div>
  );
};

// 後方互換: 従来の props で単一条件のみ編集するコンポーネント
interface FilterConditionEditorProps {
  condition: Extract<FilterCondition, { type: "condition" }>;
  index: number;
  onUpdate: (
    index: number,
    updates: Partial<Extract<FilterCondition, { type: "condition" }>>,
  ) => void;
  onRemove: (index: number) => void;
}

export const FilterConditionEditor = ({
  condition,
  index,
  onUpdate,
  onRemove,
}: FilterConditionEditorProps) => {
  return (
    <FilterConditionLeafEditor
      condition={condition}
      index={index}
      onUpdate={onUpdate}
      onRemove={onRemove}
    />
  );
};
