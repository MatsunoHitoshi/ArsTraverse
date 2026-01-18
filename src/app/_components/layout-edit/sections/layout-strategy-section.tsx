"use client";

interface LayoutStrategySectionProps {
  layoutStrategy: string | undefined;
  onUpdate: (strategy: string) => void;
}

export const LayoutStrategySection = ({
  layoutStrategy,
  onUpdate,
}: LayoutStrategySectionProps) => {
  return (
    <div className="min-w-[400px] flex-1 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-300">
        レイアウト戦略
      </h3>
      <div>
        <label className="mb-1 block text-xs text-slate-400">戦略タイプ</label>
        <input
          type="text"
          value={layoutStrategy ?? ""}
          onChange={(e) => onUpdate(e.target.value)}
          placeholder="例: force_simulation"
          className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
        />
      </div>
    </div>
  );
};
