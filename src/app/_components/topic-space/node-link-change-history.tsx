"use client";

import { api } from "@/trpc/react";
import { Input } from "@headlessui/react";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ListboxInput } from "../input/listbox-input";
import { GraphChangeType, GraphChangeEntityType } from "@prisma/client";
import { useTranslations } from "next-intl";

export const NodeLinkChangeHistory = ({
  graphChangeHistoryId,
  onHighlightChange,
}: {
  graphChangeHistoryId: string;
  onHighlightChange?: (highlight: {
    addedNodeIds: Set<string>;
    removedNodeIds: Set<string>;
    addedLinkIds: Set<string>;
    removedLinkIds: Set<string>;
  }) => void;
}) => {
  const t = useTranslations("topicSpace");
  const { data: graphChangeHistory } =
    api.topicSpaceChangeHistory.getById.useQuery({
      id: graphChangeHistoryId,
    });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedChangeType, setSelectedChangeType] = useState("ALL");
  const [selectedEntityType, setSelectedEntityType] = useState("ALL");

  const getChangeTypeLabel = useCallback(
    (type: GraphChangeType) => {
      const labels: Record<GraphChangeType, string> = {
        ADD: t("changeTypeAdd"),
        REMOVE: t("changeTypeRemove"),
        UPDATE: t("changeTypeUpdate"),
      };
      return labels[type];
    },
    [t],
  );

  const getEntityTypeLabel = useCallback(
    (type: GraphChangeEntityType) => {
      const labels: Record<GraphChangeEntityType, string> = {
        NODE: t("entityTypeNode"),
        EDGE: t("entityTypeEdge"),
      };
      return labels[type];
    },
    [t],
  );

  const changeTypeOptions = [
    { value: "ALL", label: t("filterAction") },
    ...Object.values(GraphChangeType).map((key) => ({
      value: key,
      label: getChangeTypeLabel(key),
    })),
  ];

  const entityTypeOptions = [
    { value: "ALL", label: t("filterTarget") },
    ...Object.values(GraphChangeEntityType).map((key) => ({
      value: key,
      label: getEntityTypeLabel(key),
    })),
  ];

  const filteredHistories = useMemo(() => {
    if (!graphChangeHistory) return [];
    return graphChangeHistory.nodeLinkChangeHistories.filter(
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
  }, [graphChangeHistory, selectedChangeType, selectedEntityType, searchTerm]);

  const highlightData = useMemo(() => {
    const addedNodeIds = new Set<string>();
    const removedNodeIds = new Set<string>();
    const addedLinkIds = new Set<string>();
    const removedLinkIds = new Set<string>();

    filteredHistories.forEach((history) => {
      const entityId = history.changeEntityId;
      const changeType = history.changeType;
      const entityType = history.changeEntityType;

      if (entityType === GraphChangeEntityType.NODE) {
        if (changeType === GraphChangeType.ADD) {
          addedNodeIds.add(entityId);
        } else if (changeType === GraphChangeType.REMOVE) {
          removedNodeIds.add(entityId);
        }
      } else if (entityType === GraphChangeEntityType.EDGE) {
        if (changeType === GraphChangeType.ADD) {
          addedLinkIds.add(entityId);
        } else if (changeType === GraphChangeType.REMOVE) {
          removedLinkIds.add(entityId);
        }
      }
    });

    return {
      addedNodeIds,
      removedNodeIds,
      addedLinkIds,
      removedLinkIds,
    };
  }, [filteredHistories]);

  useEffect(() => {
    if (!onHighlightChange) return;

    onHighlightChange(highlightData);

    return () => {
      if (onHighlightChange) {
        onHighlightChange({
          addedNodeIds: new Set(),
          removedNodeIds: new Set(),
          addedLinkIds: new Set(),
          removedLinkIds: new Set(),
        });
      }
    };
  }, [highlightData, onHighlightChange]);

  if (!graphChangeHistory) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{t("changeDetails")}</div>
        <div className="flex items-center gap-2">
          <Input
            className="block w-48 rounded-lg border border-gray-700 bg-slate-700 px-3 py-1.5 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder={t("searchChangeDetails")}
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
            ? t("noMatchingChangeDetails")
            : t("noChangeDetails")}
        </div>
      ) : (
        filteredHistories.map((history) => {
          const previousState = JSON.stringify(history.previousState, null, 2);
          const nextState = JSON.stringify(history.nextState, null, 2);

          return (
            <div key={history.id} className="rounded-lg bg-slate-700 p-2">
              <p className="text-sm font-semibold">
                {t("entityChange", {
                  entityType: getEntityTypeLabel(history.changeEntityType),
                  changeType: getChangeTypeLabel(history.changeType),
                })}
              </p>
              <p className="text-xs">ID: {history.changeEntityId}</p>

              {previousState !== "{}" && (
                <div className="mt-2">
                  <p className="text-sm font-semibold">{t("beforeChange")}</p>
                  <pre className="rounded-lg bg-pink-950/40 p-2 text-xs">
                    <code style={{ whiteSpace: "pre-wrap" }}>
                      {previousState}
                    </code>
                  </pre>
                </div>
              )}

              <div className="mt-2">
                <p className="text-sm font-semibold">{t("afterChange")}</p>
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
