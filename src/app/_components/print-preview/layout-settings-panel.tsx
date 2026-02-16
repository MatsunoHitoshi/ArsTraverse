"use client";

import { useState } from "react";
import type { PrintLayoutSettings, PageSizeTemplate, SizeUnit, PageOrientation, ColorMode, MetaGraphDisplayMode, LayoutOrientation, DetailedGraphDisplayMode } from "./types";
import { PAGE_SIZE_TEMPLATES, convertUnit } from "./types";
import { Button } from "@/app/_components/button/button";
import { Switch } from "@headlessui/react";
import { DownArrowIcon, RightArrowIcon } from "../icons";
interface LayoutSettingsPanelProps {
  settings: PrintLayoutSettings;
  onSettingsChange: (settings: PrintLayoutSettings) => void;
}

export function LayoutSettingsPanel({
  settings,
  onSettingsChange,
}: LayoutSettingsPanelProps) {
  const [isExpanded, setIsExpanded] = useState({
    pageSize: false,
    margins: false,
    fontSize: false,
    graphSize: false,
    colorMode: false,
    metaGraphDisplay: false,
    layoutOrientation: false,
  });

  const updateSettings = (updates: Partial<PrintLayoutSettings>) => {
    onSettingsChange({ ...settings, ...updates });
  };

  const handlePageSizeModeChange = (mode: "template" | "custom") => {
    if (mode === "template") {
      updateSettings({
        pageSize: {
          ...settings.pageSize,
          mode: "template",
          template: settings.pageSize.template ?? "A3",
        },
      });
    } else {
      updateSettings({
        pageSize: {
          ...settings.pageSize,
          mode: "custom",
          customWidth: settings.pageSize.customWidth ?? 1116,
          customHeight: settings.pageSize.customHeight ?? 800,
          unit: settings.pageSize.unit ?? "mm",
        },
      });
    }
  };

  const handleTemplateChange = (template: PageSizeTemplate) => {
    const templateSize = PAGE_SIZE_TEMPLATES[template];
    const isLandscape = settings.pageSize.orientation === "landscape";
    updateSettings({
      pageSize: {
        ...settings.pageSize,
        template,
        customWidth: isLandscape ? templateSize.height : templateSize.width,
        customHeight: isLandscape ? templateSize.width : templateSize.height,
      },
    });
  };

  const handleCustomSizeChange = (
    field: "customWidth" | "customHeight",
    value: string,
  ) => {
    const numValue = parseFloat(value) || 0;
    updateSettings({
      pageSize: {
        ...settings.pageSize,
        [field]: numValue,
      },
    });
  };

  const handleSwapDimensions = () => {
    const currentWidth = settings.pageSize.customWidth ?? 1116;
    const currentHeight = settings.pageSize.customHeight ?? 2500;
    updateSettings({
      pageSize: {
        ...settings.pageSize,
        customWidth: currentHeight,
        customHeight: currentWidth,
      },
    });
  };

  const handleUnitChange = (unit: SizeUnit) => {
    const currentUnit = settings.pageSize.unit ?? "mm";
    const currentWidth = settings.pageSize.customWidth ?? 1116;
    const currentHeight = settings.pageSize.customHeight ?? 800;

    const newWidth = convertUnit(currentWidth, currentUnit, unit);
    const newHeight = convertUnit(currentHeight, currentUnit, unit);

    updateSettings({
      pageSize: {
        ...settings.pageSize,
        unit: unit,
        customWidth: newWidth,
        customHeight: newHeight,
      },
    });
  };

  const handleOrientationChange = (orientation: PageOrientation) => {
    const currentWidth = settings.pageSize.customWidth ?? 1116;
    const currentHeight = settings.pageSize.customHeight ?? 800;

    updateSettings({
      pageSize: {
        ...settings.pageSize,
        orientation,
        // テンプレートの場合は向きに応じてサイズを入れ替え
        customWidth: orientation === "landscape" ? currentHeight : currentWidth,
        customHeight: orientation === "landscape" ? currentWidth : currentHeight,
      },
    });
  };

  const getPageSizeInMm = () => {
    if (settings.pageSize.mode === "template" && settings.pageSize.template) {
      const template = PAGE_SIZE_TEMPLATES[settings.pageSize.template];
      const isLandscape = settings.pageSize.orientation === "landscape";
      return {
        width: isLandscape ? template.height : template.width,
        height: isLandscape ? template.width : template.height,
      };
    } else {
      const unit = settings.pageSize.unit ?? "mm";
      const width = settings.pageSize.customWidth ?? 1116;
      const height = settings.pageSize.customHeight ?? 800;
      return {
        width: convertUnit(width, unit, "mm"),
        height: convertUnit(height, unit, "mm"),
      };
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-slate-200">
      <div className="flex items-center gap-2">
        <div className="font-bold">
          プリントプレビュー
        </div>
      </div>

      <h2 className="text-lg font-bold">レイアウト設定</h2>

      {/* ページサイズ設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <button
          onClick={() =>
            setIsExpanded({ ...isExpanded, pageSize: !isExpanded.pageSize })
          }
          className="flex w-full items-center justify-between"
        >
          <h3 className="font-semibold">ページサイズ</h3>
          <span className="text-sm text-slate-400">
            {isExpanded.pageSize ? "−" : "+"}
          </span>
        </button>

        {isExpanded.pageSize && (
          <div className="mt-4 space-y-4">
            {/* モード選択 */}
            <div className="flex gap-2">
              <Button
                size="small"
                onClick={() => handlePageSizeModeChange("template")}
                className={`flex-1 ${settings.pageSize.mode === "template"
                  ? "bg-blue-600"
                  : "bg-slate-700"
                  }`}
              >
                テンプレート
              </Button>
              <Button
                size="small"
                onClick={() => handlePageSizeModeChange("custom")}
                className={`flex-1 ${settings.pageSize.mode === "custom"
                  ? "bg-blue-600"
                  : "bg-slate-700"
                  }`}
              >
                カスタム
              </Button>
            </div>

            {/* テンプレート選択 */}
            {settings.pageSize.mode === "template" && (
              <div>
                <label className="mb-2 block text-sm">テンプレート</label>
                <select
                  value={settings.pageSize.template ?? "A3"}
                  onChange={(e) =>
                    handleTemplateChange(e.target.value as PageSizeTemplate)
                  }
                  className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                >
                  {Object.keys(PAGE_SIZE_TEMPLATES).map((template) => (
                    <option key={template} value={template}>
                      {template}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* カスタムサイズ */}
            {settings.pageSize.mode === "custom" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-sm">単位</label>
                  <div className="flex gap-2">
                    {(["mm", "cm", "inch"] as SizeUnit[]).map((unit) => (
                      <Button
                        key={unit}
                        size="small"
                        onClick={() => handleUnitChange(unit)}
                        className={`flex-1 ${settings.pageSize.unit === unit
                          ? "bg-blue-600"
                          : "bg-slate-700"
                          }`}
                      >
                        {unit}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <label className="block text-sm">幅</label>
                      <Button
                        size="small"
                        onClick={handleSwapDimensions}
                        className="h-6 w-6 p-0 flex items-center justify-center ml-auto"
                      >
                        <svg
                          width={14}
                          height={14}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M8 3L4 7l4 4" />
                          <path d="M4 7h16" />
                          <path d="M16 21l4-4-4-4" />
                          <path d="M20 17H4" />
                        </svg>
                      </Button>
                    </div>
                    <input
                      type="number"
                      value={settings.pageSize.customWidth ?? 1116}
                      onChange={(e) =>
                        handleCustomSizeChange("customWidth", e.target.value)
                      }
                      min={10}
                      max={2000}
                      step={0.1}
                      className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm">高さ</label>
                    <input
                      type="number"
                      value={settings.pageSize.customHeight ?? 2500}
                      onChange={(e) =>
                        handleCustomSizeChange("customHeight", e.target.value)
                      }
                      min={10}
                      max={5000}
                      step={0.1}
                      className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 向き選択 */}
            <div>
              <label className="mb-2 block text-sm">向き</label>
              <div className="flex gap-2">
                <Button
                  size="small"
                  onClick={() => handleOrientationChange("portrait")}
                  className={`flex-1 ${settings.pageSize.orientation === "portrait"
                    ? "bg-blue-600"
                    : "bg-slate-700"
                    }`}
                >
                  縦
                </Button>
                <Button
                  size="small"
                  onClick={() => handleOrientationChange("landscape")}
                  className={`flex-1 ${settings.pageSize.orientation === "landscape"
                    ? "bg-blue-600"
                    : "bg-slate-700"
                    }`}
                >
                  横
                </Button>
              </div>
            </div>

            {/* プレビューサイズ表示 */}
            <div className="rounded bg-slate-800 p-2 text-xs text-slate-400">
              <div>プレビューサイズ:</div>
              <div className="font-mono">
                {getPageSizeInMm().width.toFixed(1)}mm ×{" "}
                {getPageSizeInMm().height.toFixed(1)}mm
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 余白設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <button
          onClick={() =>
            setIsExpanded({ ...isExpanded, margins: !isExpanded.margins })
          }
          className="flex w-full items-center justify-between"
        >
          <h3 className="font-semibold">余白 (mm)</h3>
          <span className="text-sm text-slate-400">
            {isExpanded.margins ? "−" : "+"}
          </span>
        </button>

        {isExpanded.margins && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-2 block text-sm">上</label>
              <input
                type="number"
                value={settings.margins.top}
                onChange={(e) =>
                  updateSettings({
                    margins: {
                      ...settings.margins,
                      top: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                min={0}
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm">右</label>
              <input
                type="number"
                value={settings.margins.right}
                onChange={(e) =>
                  updateSettings({
                    margins: {
                      ...settings.margins,
                      right: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                min={0}
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm">下</label>
              <input
                type="number"
                value={settings.margins.bottom}
                onChange={(e) =>
                  updateSettings({
                    margins: {
                      ...settings.margins,
                      bottom: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                min={0}
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm">左</label>
              <input
                type="number"
                value={settings.margins.left}
                onChange={(e) =>
                  updateSettings({
                    margins: {
                      ...settings.margins,
                      left: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                min={0}
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* フォントサイズ設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <button
          onClick={() =>
            setIsExpanded({ ...isExpanded, fontSize: !isExpanded.fontSize })
          }
          className="flex w-full items-center justify-between"
        >
          <h3 className="font-semibold">フォントサイズ (pt)</h3>
          <span className="text-sm text-slate-400">
            {isExpanded.fontSize ? "−" : "+"}
          </span>
        </button>

        {isExpanded.fontSize && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-2 block text-sm">ワークスペースタイトル</label>
              <input
                type="number"
                value={((v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : 21))(settings.fontSize?.workspaceTitle)}
                onChange={(e) =>
                  updateSettings({
                    fontSize: {
                      ...settings.fontSize,
                      workspaceTitle: parseFloat(e.target.value) || 21,
                    },
                  })
                }
                min={8}
                max={72}
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm">セクションタイトル</label>
              <input
                type="number"
                value={((v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : 14))(settings.fontSize?.sectionTitle)}
                onChange={(e) =>
                  updateSettings({
                    fontSize: {
                      ...settings.fontSize,
                      sectionTitle: parseFloat(e.target.value) || 14,
                    },
                  })
                }
                min={8}
                max={48}
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm">本文</label>
              <input
                type="number"
                value={settings.fontSize.body}
                onChange={(e) =>
                  updateSettings({
                    fontSize: {
                      ...settings.fontSize,
                      body: parseFloat(e.target.value) || 14,
                    },
                  })
                }
                min={8}
                max={24}
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm">ノード</label>
              <input
                type="number"
                value={settings.fontSize.node}
                onChange={(e) =>
                  updateSettings({
                    fontSize: {
                      ...settings.fontSize,
                      node: parseFloat(e.target.value) || 12,
                    },
                  })
                }
                min={8}
                max={24}
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm">エッジ</label>
              <input
                type="number"
                value={((v: unknown) => (typeof v === "number" && !Number.isNaN(v) ? v : 6))(settings.fontSize?.edge)}
                onChange={(e) =>
                  updateSettings({
                    fontSize: {
                      ...settings.fontSize,
                      edge: parseFloat(e.target.value) || 6,
                    },
                  })
                }
                min={4}
                max={20}
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* グラフサイズ設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <button
          onClick={() =>
            setIsExpanded({ ...isExpanded, graphSize: !isExpanded.graphSize })
          }
          className="flex w-full items-center justify-between"
        >
          <h3 className="font-semibold">グラフサイズ</h3>
          <span className="text-sm text-slate-400">
            {isExpanded.graphSize ? "−" : "+"}
          </span>
        </button>

        {isExpanded.graphSize && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.graphSize.autoFit}
                  onChange={(e) =>
                    updateSettings({
                      graphSize: {
                        ...settings.graphSize,
                        autoFit: e.target.checked,
                      },
                    })
                  }
                  className="rounded"
                />
                <span className="text-sm">自動調整</span>
              </label>
            </div>
            {!settings.graphSize.autoFit && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-2 block text-sm">幅 (px)</label>
                  <input
                    type="number"
                    value={settings.graphSize.width}
                    onChange={(e) =>
                      updateSettings({
                        graphSize: {
                          ...settings.graphSize,
                          width: parseFloat(e.target.value) || 800,
                        },
                      })
                    }
                    min={100}
                    max={2000}
                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm">高さ (px)</label>
                  <input
                    type="number"
                    value={settings.graphSize.height}
                    onChange={(e) =>
                      updateSettings({
                        graphSize: {
                          ...settings.graphSize,
                          height: parseFloat(e.target.value) || 600,
                        },
                      })
                    }
                    min={100}
                    max={2000}
                    className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* カラーモード設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <button
          onClick={() =>
            setIsExpanded({ ...isExpanded, colorMode: !isExpanded.colorMode })
          }
          className="flex w-full items-center justify-between"
        >
          <h3 className="font-semibold">カラーモード</h3>
          <span className="text-sm text-slate-400">
            {isExpanded.colorMode ? "−" : "+"}
          </span>
        </button>

        {isExpanded.colorMode && (
          <div className="mt-4">
            <div className="flex gap-2">
              <Button
                size="small"
                onClick={() =>
                  updateSettings({ colorMode: "color" as ColorMode })
                }
                className={`flex-1 ${settings.colorMode === "color"
                  ? "bg-blue-600"
                  : "bg-slate-700"
                  }`}
              >
                カラー
              </Button>
              <Button
                size="small"
                onClick={() =>
                  updateSettings({ colorMode: "grayscale" as ColorMode })
                }
                className={`flex-1 ${settings.colorMode === "grayscale"
                  ? "bg-blue-600"
                  : "bg-slate-700"
                  }`}
              >
                グレースケール
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* レイアウト方向設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">レイアウト方向</h3>
          <Button
            size="small"
            onClick={() => {
              const next: LayoutOrientation =
                settings.layoutOrientation === "horizontal" ? "vertical" : "horizontal";
              updateSettings({ layoutOrientation: next });
            }}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600"
          >
            {settings.layoutOrientation === "horizontal" ? (
              <DownArrowIcon height={16} width={16} color="white" />
            ) : (
              <RightArrowIcon height={16} width={16} color="white" />
            )}
          </Button>
        </div>
      </div>

      {/* メタグラフ表示設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">コミュニティ表示</h3>
          <Button
            size="small"
            onClick={() => {
              const current = settings.metaGraphDisplay ?? "none";
              const next: MetaGraphDisplayMode =
                current === "none" ? "story" :
                  current === "story" ? "all" : "none";
              updateSettings({ metaGraphDisplay: next });
            }}
            className="bg-slate-700 hover:bg-slate-600"
          >
            {settings.metaGraphDisplay === "none" && "非表示"}
            {settings.metaGraphDisplay === "story" && "ストーリーのみ"}
            {settings.metaGraphDisplay === "all" && "全て表示"}
          </Button>
        </div>
      </div>

      {/* テキストオーバーレイ表示設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">ストーリー表示</h3>
          <Switch
            checked={settings.textOverlayDisplay === "show"}
            onChange={(checked) => {
              updateSettings({ textOverlayDisplay: checked ? "show" : "none" });
            }}
            className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-blue-500"
          >
            <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
          </Switch>
        </div>
      </div>

      {/* ワークスペースタイトル表示設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">タイトル表示</h3>
          <Switch
            checked={settings.workspaceTitleDisplay === "show"}
            onChange={(checked) => {
              updateSettings({ workspaceTitleDisplay: checked ? "show" : "none" });
            }}
            className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-blue-500"
          >
            <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
          </Switch>
        </div>
      </div>

      {/* 詳細グラフ表示設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">ノード表示</h3>
          <Button
            size="small"
            onClick={() => {
              const current = settings.detailedGraphDisplay ?? "all";
              const next: DetailedGraphDisplayMode =
                current === "all" ? "story" : "all";
              updateSettings({ detailedGraphDisplay: next });
            }}
            className="bg-slate-700 hover:bg-slate-600"
          >
            {settings.detailedGraphDisplay === "story" ? "ストーリーのみ" : "全て表示"}
          </Button>
        </div>
      </div>

      {/* エッジラベル表示設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">エッジラベル表示</h3>
          <Switch
            checked={settings.showEdgeLabels ?? false}
            onChange={(checked) => {
              updateSettings({ showEdgeLabels: checked });
            }}
            className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-blue-500"
          >
            <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
          </Switch>
        </div>
      </div>

      {/* エッジ色設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <h3 className="mb-3 font-semibold">エッジ色</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-slate-400">通常エッジ</label>
            <div className="flex items-center gap-3">
              {(() => {
                const raw = settings.edgeColor;
                const edgeColor: string =
                  typeof raw === "string" ? raw : "#60a5fa";
                return (
                  <>
                    <input
                      type="color"
                      value={edgeColor}
                      onChange={(e) => updateSettings({ edgeColor: e.currentTarget.value })}
                      className="h-10 w-14 cursor-pointer rounded border border-slate-600 bg-transparent p-1"
                    />
                    <input
                      type="text"
                      value={edgeColor}
                      onChange={(e) => updateSettings({ edgeColor: e.currentTarget.value })}
                      className="w-24 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 font-mono text-sm"
                    />
                  </>
                );
              })()}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-400">フォーカスエッジ</label>
            <div className="flex items-center gap-3">
              {(() => {
                const raw = settings.edgeFocusColor;
                const edgeFocusColor: string =
                  typeof raw === "string" ? raw : "#2563eb";
                return (
                  <>
                    <input
                      type="color"
                      value={edgeFocusColor}
                      onChange={(e) => updateSettings({ edgeFocusColor: e.currentTarget.value })}
                      className="h-10 w-14 cursor-pointer rounded border border-slate-600 bg-transparent p-1"
                    />
                    <input
                      type="text"
                      value={edgeFocusColor}
                      onChange={(e) => updateSettings({ edgeFocusColor: e.currentTarget.value })}
                      className="w-24 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 font-mono text-sm"
                    />
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ノード色設定 */}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <h3 className="mb-3 font-semibold">ノード色</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-slate-400">通常ノード</label>
            <div className="flex items-center gap-3">
              {(() => {
                const raw = settings.nodeColor;
                const nodeColor: string =
                  typeof raw === "string" ? raw : "#4a5568";
                return (
                  <>
                    <input
                      type="color"
                      value={nodeColor}
                      onChange={(e) => updateSettings({ nodeColor: e.currentTarget.value })}
                      className="h-10 w-14 cursor-pointer rounded border border-slate-600 bg-transparent p-1"
                    />
                    <input
                      type="text"
                      value={nodeColor}
                      onChange={(e) => updateSettings({ nodeColor: e.currentTarget.value })}
                      className="w-24 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 font-mono text-sm"
                    />
                  </>
                );
              })()}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-400">フォーカスノード</label>
            <div className="flex items-center gap-3">
              {(() => {
                const raw = settings.nodeFocusColor;
                const nodeFocusColor: string =
                  typeof raw === "string" ? raw : "#2563eb";
                return (
                  <>
                    <input
                      type="color"
                      value={nodeFocusColor}
                      onChange={(e) => updateSettings({ nodeFocusColor: e.currentTarget.value })}
                      className="h-10 w-14 cursor-pointer rounded border border-slate-600 bg-transparent p-1"
                    />
                    <input
                      type="text"
                      value={nodeFocusColor}
                      onChange={(e) => updateSettings({ nodeFocusColor: e.currentTarget.value })}
                      className="w-24 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 font-mono text-sm"
                    />
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* PDFファイル名設定 */}
      {/* <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <h3 className="mb-3 font-semibold">PDFダウンロード</h3>
        <div>
          <label className="mb-2 block text-sm text-slate-400">
            ファイル名（拡張子なし・未入力時はワークスペース名を使用）
          </label>
          <input
            type="text"
            value={settings.pdfFilename ?? ""}
            onChange={(e) => updateSettings({ pdfFilename: e.target.value || undefined })}
            placeholder="例: ストーリーグラフ"
            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
          />
        </div>
      </div> */}

    </div>
  );
}
