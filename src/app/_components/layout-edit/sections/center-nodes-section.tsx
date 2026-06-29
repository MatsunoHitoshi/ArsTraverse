"use client";

import { useTranslations } from "next-intl";

interface CenterNodesSectionProps {
  targetNodeIds: string[];
  onUpdate: (targetNodeIds: string[]) => void;
}

export const CenterNodesSection = ({
  targetNodeIds,
  onUpdate,
}: CenterNodesSectionProps) => {
  const t = useTranslations("layoutEdit");

  return (
    <div className="min-w-[400px] flex-1 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-300">
        {t("centerNodes")}
      </h3>
      <div>
        <label className="mb-1 block text-xs text-slate-400">
          {t("targetNodeIds")}
        </label>
        <input
          type="text"
          value={targetNodeIds.join(", ")}
          onChange={(e) => {
            const nodeIds = e.target.value
              .split(",")
              .map((id) => id.trim())
              .filter((id) => id.length > 0);
            onUpdate(nodeIds);
          }}
          placeholder={t("nodeIdsPlaceholder")}
          className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
        />
      </div>
    </div>
  );
};
