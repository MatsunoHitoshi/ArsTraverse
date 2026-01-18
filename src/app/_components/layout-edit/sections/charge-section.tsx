"use client";

interface ChargeSectionProps {
  strength: number | undefined;
  onUpdate: (strength: number) => void;
}

export const ChargeSection = ({ strength, onUpdate }: ChargeSectionProps) => {
  return (
    <div className="min-w-[400px] flex-1 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-300">
        反発力 (Charge)
      </h3>
      <div>
        <label className="mb-1 block text-xs text-slate-400">
          強度: {strength ?? -100}
        </label>
        <input
          type="range"
          min="-500"
          max="0"
          step="10"
          value={strength ?? -100}
          onChange={(e) => onUpdate(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  );
};
