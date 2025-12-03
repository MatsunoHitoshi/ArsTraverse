import { ChangeTypeMap, EntityTypeMap } from "@/app/const/types";
import { api } from "@/trpc/react";
import { Input } from "@headlessui/react";
import React, { useState } from "react";
import { ListboxInput } from "../input/listbox-input";

export const NodeLinkChangeHistory = ({
  graphChangeHistoryId,
}: {
  graphChangeHistoryId: string;
}) => {
  const { data: graphChangeHistory } =
    api.topicSpaceChangeHistory.getById.useQuery({
      id: graphChangeHistoryId,
    });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedChangeType, setSelectedChangeType] = useState("ALL");
  const [selectedEntityType, setSelectedEntityType] = useState("ALL");

  if (!graphChangeHistory) return null;

  const changeTypeOptions = [
    { value: "ALL", label: "動作" },
    ...Object.entries(ChangeTypeMap).map(([key, value]) => ({
      value: key,
      label: value,
    })),
  ];

  const entityTypeOptions = [
    { value: "ALL", label: "対象" },
    ...Object.entries(EntityTypeMap).map(([key, value]) => ({
      value: key,
      label: value,
    })),
  ];

  const filteredHistories = graphChangeHistory.nodeLinkChangeHistories.filter(
    (history) => {
      if (
        selectedChangeType !== "ALL" &&
        history.changeType !== selectedChangeType
      )
        return false;

      if (
        selectedEntityType !== "ALL" &&
        history.changeEntityType !== selectedEntityType
      )
        return false;

      if (!searchTerm) return true;
      const previousState = JSON.stringify(history.previousState, null, 2);
      const nextState = JSON.stringify(history.nextState, null, 2);
      const term = searchTerm.toLowerCase();
      return (
        previousState.toLowerCase().includes(term) ||
        nextState.toLowerCase().includes(term)
      );
    },
  );

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">変更内容</div>
        <div className="flex items-center gap-2">
          <Input
            className="block w-48 rounded-lg border border-gray-700 bg-slate-700 px-3 py-1.5 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder="変更内容を検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <ListboxInput
            options={entityTypeOptions}
            selected={selectedEntityType}
            setSelected={setSelectedEntityType}
            className="w-32"
            buttonClassName="py-1.5 text-sm bg-slate-700"
          />
          <ListboxInput
            options={changeTypeOptions}
            selected={selectedChangeType}
            setSelected={setSelectedChangeType}
            className="w-32"
            buttonClassName="py-1.5 text-sm bg-slate-700"
          />
        </div>
      </div>
      {filteredHistories.length === 0 ? (
        <div className="py-4 text-center text-xs text-gray-500">
          {searchTerm ||
          selectedChangeType !== "ALL" ||
          selectedEntityType !== "ALL"
            ? "条件に一致する変更内容がありません"
            : "変更内容がありません"}
        </div>
      ) : (
        filteredHistories.map((history) => {
          const previousState = JSON.stringify(history.previousState, null, 2);
          const nextState = JSON.stringify(history.nextState, null, 2);

          return (
            <div key={history.id} className="rounded-lg bg-slate-700 p-2">
              <p className="text-sm font-semibold">
                {EntityTypeMap[history.changeEntityType]}の
                {ChangeTypeMap[history.changeType]}
              </p>
              <p className="text-xs">ID: {history.changeEntityId}</p>

              {previousState !== "{}" && (
                <div className="mt-2">
                  <p className="text-sm font-semibold">変更前</p>
                  <pre className="rounded-lg bg-pink-950/40 p-2 text-xs">
                    <code style={{ whiteSpace: "pre-wrap" }}>
                      {previousState}
                    </code>
                  </pre>
                </div>
              )}

              <div className="mt-2">
                <p className="text-sm font-semibold">変更後</p>
                <pre className="rounded-lg bg-green-950/40 p-2 text-xs">
                  <code style={{ whiteSpace: "pre-wrap" }}>{nextState}</code>
                </pre>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
