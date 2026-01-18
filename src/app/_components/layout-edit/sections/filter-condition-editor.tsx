"use client";

import { Button } from "@/app/_components/button/button";
import type { FilterCondition } from "@/app/const/types";

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
                const currentField = condition.field;
                if (
                  currentField !== "label" &&
                  currentField !== "name" &&
                  currentField !== ""
                ) {
                  return;
                }
                onUpdate(index, { field: "" });
              } else {
                onUpdate(index, { field: e.target.value });
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
              onChange={(e) => {
                onUpdate(index, { field: e.target.value });
              }}
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
                  ? []
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
          <input
            type="text"
            value={
              Array.isArray(condition.value) ? condition.value.join(", ") : ""
            }
            onChange={(e) => {
              const values = e.target.value
                .split(",")
                .map((v) => v.trim())
                .filter((v) => v.length > 0);
              onUpdate(index, { value: values });
            }}
            placeholder="カンマ区切り（例: Person, Organization）"
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
          />
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
            onChange={(e) => {
              onUpdate(index, { value: e.target.value });
            }}
            placeholder="値を入力"
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
          />
        )}
      </div>
    </div>
  );
};
