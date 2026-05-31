"use client";

interface FocusNodesSectionProps {
  targetNodeIds: string[];
  chargeMultiplier: number | undefined;
  onUpdate: (targetNodeIds: string[], chargeMultiplier: number) => void;
}

export const FocusNodesSection = ({
  targetNodeIds,
  chargeMultiplier,
  onUpdate,
}: FocusNodesSectionProps) => {
  return (
    <div className="min-w-[400px] flex-1 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-300">
        フォーカスノード (Focus Nodes)
      </h3>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            対象ノードID（カンマ区切り）
          </label>
          <input
            type="text"
            value={targetNodeIds.join(", ")}
            onChange={(e) => {
              const nodeIds = e.target.value
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id.length > 0);
              onUpdate(nodeIds, chargeMultiplier ?? 2.0);
            }}
            placeholder="例: node1, node2, node3"
            className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">
            反発力倍率: {chargeMultiplier ?? 2.0}
          </label>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={chargeMultiplier ?? 2.0}
            onChange={(e) => {
              onUpdate(targetNodeIds, parseFloat(e.target.value));
            }}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};
