import { Input, Switch } from "@headlessui/react";
import clsx from "clsx";
import React from "react";
import { Button } from "../button/button";
import type { EdgeType } from "@/app/_utils/kg/get-tree-layout-data";
import { ZoomInIcon } from "../icons";
type ToolbarProps = {
  isLinkFiltered?: boolean;
  setIsLinkFiltered?: React.Dispatch<React.SetStateAction<boolean>>;
  isUseExample?: boolean;
  setIsUseExample?: React.Dispatch<React.SetStateAction<boolean>>;
  isEditor?: boolean;
  setIsEditing?: React.Dispatch<React.SetStateAction<boolean>>;
  setNodeSearchQuery?: React.Dispatch<React.SetStateAction<string>>;
  rightArea?: React.ReactNode;
  edgeType?: EdgeType;
  setEdgeType?: React.Dispatch<React.SetStateAction<EdgeType>>;
  magnifierMode?: number;
  setMagnifierMode?: React.Dispatch<React.SetStateAction<number>>;
};
export const Toolbar = ({
  isLinkFiltered,
  setIsLinkFiltered,
  isUseExample,
  setIsUseExample,
  isEditor = false,
  setIsEditing,
  setNodeSearchQuery,
  rightArea,
  edgeType,
  setEdgeType,
  magnifierMode,
  setMagnifierMode,
}: ToolbarProps) => {
  return (
    <div className="flex h-[46px] w-full flex-row items-center justify-between">
      <div className="flex w-full flex-row items-center gap-4">
        {!!setMagnifierMode && magnifierMode !== undefined && (
          <button
            onClick={() => setMagnifierMode((prev) => (prev + 1) % 3)}
            className={`flex items-center rounded-lg p-2 backdrop-blur-sm ${magnifierMode === 1
                ? "bg-orange-500/40"
                : magnifierMode === 2
                  ? "bg-orange-700/40"
                  : "bg-black/20"
              }`}
          >
            <ZoomInIcon
              height={16}
              width={16}
              color={magnifierMode > 0 ? "orange" : "white"}
            />
          </button>
        )}
        {!!setIsEditing && (
          <div className="flex flex-row items-center gap-2">
            <div className="text-sm">直接編集</div>
            <div>
              <Switch
                checked={isEditor}
                onChange={setIsEditing}
                className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-orange-400 data-[disabled]:bg-slate-700"
              >
                <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
              </Switch>
            </div>
          </div>
        )}
        {!!setIsLinkFiltered && (
          <div className="flex flex-row items-center gap-2">
            <div className="truncate text-sm">リンクフィルタ</div>
            <div>
              <Switch
                checked={isLinkFiltered}
                onChange={setIsLinkFiltered}
                className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-orange-400"
              >
                <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
              </Switch>
            </div>
          </div>
        )}
        {!!setEdgeType && (
          <div className="flex flex-row items-center">
            <Button
              onClick={() => setEdgeType(edgeType === "OUT" ? "IN" : "OUT")}
              className=" !text-xs"
            >
              {edgeType === "OUT" ? "外方向接続" : "内方向接続"}
            </Button>
          </div>
        )}
        {!!setIsUseExample && (
          <div className="flex flex-row items-center gap-2">
            <div className="text-sm">サンプルデータを表示</div>
            <div>
              <Switch
                checked={isUseExample}
                onChange={setIsUseExample}
                className="group inline-flex h-6 w-11 items-center rounded-full bg-slate-400 transition data-[checked]:bg-orange-400"
              >
                <span className="size-4 translate-x-1 rounded-full bg-white transition group-data-[checked]:translate-x-6" />
              </Switch>
            </div>
          </div>
        )}
        {!!setNodeSearchQuery && (
          <Input
            type="text"
            placeholder="ノードを検索"
            className={clsx(
              "block w-full max-w-[300px] rounded-lg border-none bg-white/5 px-3 py-1.5 text-sm/6",
              "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
            )}
            onChange={(e) => {
              setNodeSearchQuery(e.target.value);
            }}
          />
        )}
      </div>

      {!!rightArea && <>{rightArea}</>}
    </div>
  );
};
