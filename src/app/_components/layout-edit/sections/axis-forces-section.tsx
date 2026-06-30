"use client";

import { useTranslations } from "next-intl";
import type { LayoutInstruction } from "@/app/const/types";

type AxisType = NonNullable<NonNullable<LayoutInstruction["forces"]>["x_axis"]>;

interface AxisForcesSectionProps {
  xAxis: AxisType | undefined;
  yAxis: AxisType | undefined;
  onUpdateXAxis: (updates: Partial<AxisType>) => void;
  onUpdateYAxis: (updates: Partial<AxisType>) => void;
  parseGroupsJson: (
    jsonString: string,
  ) => Record<string, string | number> | null;
}

export const AxisForcesSection = ({
  xAxis,
  yAxis,
  onUpdateXAxis,
  onUpdateYAxis,
  parseGroupsJson,
}: AxisForcesSectionProps) => {
  const t = useTranslations("layoutEdit");

  return (
    <div className="min-w-[500px] flex-1 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-300">
        {t("axisSettings")}
      </h3>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              {t("xAxisType")}
            </label>
            <select
              value={xAxis?.type ?? "none"}
              onChange={(e) =>
                onUpdateXAxis({
                  type: e.target.value as
                    | "timeline"
                    | "category_separation"
                    | "linear"
                    | "none",
                })
              }
              className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
            >
              <option value="none">{t("axisNone")}</option>
              <option value="linear">{t("axisLinear")}</option>
              <option value="timeline">{t("axisTimeline")}</option>
              <option value="category_separation">{t("axisCategorySeparation")}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              {t("yAxisType")}
            </label>
            <select
              value={yAxis?.type ?? "none"}
              onChange={(e) =>
                onUpdateYAxis({
                  type: e.target.value as
                    | "timeline"
                    | "category_separation"
                    | "linear"
                    | "none",
                })
              }
              className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
            >
              <option value="none">{t("axisNone")}</option>
              <option value="linear">{t("axisLinear")}</option>
              <option value="timeline">{t("axisTimeline")}</option>
              <option value="category_separation">{t("axisCategorySeparation")}</option>
            </select>
          </div>
        </div>

        {(xAxis?.type === "timeline" ||
          xAxis?.type === "category_separation" ||
          yAxis?.type === "timeline" ||
          yAxis?.type === "category_separation") && (
          <div className="grid grid-cols-2 gap-4">
            {(xAxis?.type === "timeline" ||
              xAxis?.type === "category_separation") && (
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("xAxisAttribute")}
                </label>
                <input
                  type="text"
                  value={xAxis?.attribute ?? ""}
                  onChange={(e) => onUpdateXAxis({ attribute: e.target.value })}
                  placeholder={t("attributePlaceholder")}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
                />
              </div>
            )}
            {(yAxis?.type === "timeline" ||
              yAxis?.type === "category_separation") && (
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("yAxisAttribute")}
                </label>
                <input
                  type="text"
                  value={yAxis?.attribute ?? ""}
                  onChange={(e) => onUpdateYAxis({ attribute: e.target.value })}
                  placeholder={t("attributePlaceholder")}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
                />
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              {t("xAxisStrength", {
                value: (xAxis?.strength ?? 0.5).toFixed(2),
              })}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={xAxis?.strength ?? 0.5}
              onChange={(e) =>
                onUpdateXAxis({ strength: parseFloat(e.target.value) })
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              {t("yAxisStrength", {
                value: (yAxis?.strength ?? 0.5).toFixed(2),
              })}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={yAxis?.strength ?? 0.5}
              onChange={(e) =>
                onUpdateYAxis({ strength: parseFloat(e.target.value) })
              }
              className="w-full"
            />
          </div>
        </div>

        {xAxis?.type === "category_separation" && (
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              {t("xAxisGroups")}
            </label>
            <textarea
              value={JSON.stringify(xAxis?.groups ?? {}, null, 2)}
              onChange={(e) => {
                const groups = parseGroupsJson(e.target.value);
                if (groups !== null) {
                  onUpdateXAxis({ groups });
                }
              }}
              placeholder='{"group1": "left", "group2": "right"}'
              className="h-24 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200"
            />
          </div>
        )}
        {yAxis?.type === "category_separation" && (
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              {t("yAxisGroups")}
            </label>
            <textarea
              value={JSON.stringify(yAxis?.groups ?? {}, null, 2)}
              onChange={(e) => {
                const groups = parseGroupsJson(e.target.value);
                if (groups !== null) {
                  onUpdateYAxis({ groups });
                }
              }}
              placeholder='{"group1": "top", "group2": "bottom"}'
              className="h-24 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200"
            />
          </div>
        )}
      </div>
    </div>
  );
};
