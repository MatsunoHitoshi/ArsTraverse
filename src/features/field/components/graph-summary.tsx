"use client";

import { Link } from "i18n/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { CheckIcon, Pencil2Icon } from "@/app/_components/icons";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { PublishedNodeMatch } from "@/server/api/schemas/scan";
import {
  GraphSummaryEditModal,
  type GraphItemEditPayload,
} from "@/features/field/components/graph-summary-edit-modal";

type GraphSummaryProps = {
  graph: GraphDocumentForFrontend;
  matchCandidates?: PublishedNodeMatch[];
  onGraphChange?: (graph: GraphDocumentForFrontend) => void;
  /** 編集モード終了時にノード名が変わっていた場合に呼ばれる（一致候補の再取得用） */
  onRefreshNodeMatches?: () => void;
};

function normalizeNodeName(name: string | undefined | null): string {
  return (name ?? "").trim().toLowerCase();
}

function groupMatchesByName(
  matches: PublishedNodeMatch[],
): Map<string, PublishedNodeMatch[]> {
  const map = new Map<string, PublishedNodeMatch[]>();

  for (const match of matches) {
    const key = normalizeNodeName(match.name);
    const existing = map.get(key) ?? [];
    existing.push(match);
    map.set(key, existing);
  }

  return map;
}

function NodeMatchPreview({ matches }: { matches: PublishedNodeMatch[] }) {
  const t = useTranslations("field");
  const topicSpaceMatches = matches.filter(
    (match) => match.sourceType === "topicSpace",
  );
  const sourceDocumentMatches = matches.filter(
    (match) => match.sourceType === "sourceDocument",
  );
  const workspaceMatches = matches.filter(
    (match) => match.sourceType === "workspace",
  );

  const workspacePart =
    workspaceMatches.length > 0
      ? t("matchSummaryWorkspace", { count: workspaceMatches.length })
      : "";

  return (
    <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-3">
      <p className="mb-2 text-xs font-medium text-orange-300">
        {t("matchCandidates", { count: matches.length })}
      </p>
      <ul className="flex flex-col gap-2">
        {matches.map((match) => (
          <li
            key={`${match.sourceType}-${match.nodeId}-${match.workspaceId ?? match.sourceDocumentId ?? match.topicSpaceId ?? "unknown"}`}
            className="rounded-md border border-slate-700/80 bg-slate-900/70 p-3"
          >
            <div className="text-sm font-medium text-slate-100">{match.name}</div>
            <div className="mt-1 text-xs text-slate-400">
              {match.label}
              {match.sourceType === "topicSpace" && match.topicSpaceName
                ? ` · ${match.topicSpaceName}`
                : ""}
            </div>
            {match.sourceType === "topicSpace" && match.topicSpaceId ? (
              <Link
                href={`/topic-spaces/${match.topicSpaceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-emerald-300 underline-offset-2 hover:underline"
              >
                {t("openNamed", {
                  name: match.topicSpaceName ?? t("topicSpace"),
                })}
              </Link>
            ) : match.sourceType === "sourceDocument" &&
              match.sourceDocumentId ? (
              <Link
                href={
                  match.sourceDocumentType === "INPUT_SCAN"
                    ? `/field/scan/${match.sourceDocumentId}`
                    : `/documents/${match.sourceDocumentId}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-orange-300 underline-offset-2 hover:underline"
              >
                {t("openNamed", {
                  name:
                    match.sourceDocumentName ??
                    (match.sourceDocumentType === "INPUT_SCAN"
                      ? t("scan")
                      : t("document")),
                })}
              </Link>
            ) : match.sourceType === "workspace" && match.workspaceId ? (
              <Link
                href={`/workspaces/${match.workspaceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-sky-400 underline-offset-2 hover:underline"
              >
                {t("openNamed", {
                  name: match.workspaceName ?? t("workspace"),
                })}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {(topicSpaceMatches.length > 0 ||
        sourceDocumentMatches.length > 0 ||
        workspaceMatches.length > 0) && (
          <p className="mt-2 text-xs text-slate-400">
            {t("matchSummary", {
              topicSpaceCount: topicSpaceMatches.length,
              documentCount: sourceDocumentMatches.length,
              workspacePart,
            })}
          </p>
        )}
    </div>
  );
}

type EditModeTriggerProps = {
  isEditMode: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
};

function EditModeTrigger({
  isEditMode,
  onClick,
  className = "",
  children,
}: EditModeTriggerProps) {
  if (!isEditMode) {
    return <>{children}</>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`max-w-full cursor-pointer rounded-lg text-left transition hover:ring-2 hover:ring-orange-400/50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GraphSummary({
  graph,
  matchCandidates = [],
  onGraphChange,
  onRefreshNodeMatches,
}: GraphSummaryProps) {
  const t = useTranslations("field");
  const canEdit = onGraphChange != null;
  const [isEditMode, setIsEditMode] = useState(false);
  const nodeNamesAtEditStartRef = useRef<Map<string, string>>(new Map());
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<GraphItemEditPayload | null>(
    null,
  );
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const nodesMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const matchesByName = useMemo(
    () => groupMatchesByName(matchCandidates),
    [matchCandidates],
  );
  const matchedNodeCount = graph.nodes.filter(
    (node) => (matchesByName.get(normalizeNodeName(node.name))?.length ?? 0) > 0,
  ).length;

  const openNodeEditor = (nodeId: string) => {
    const node = nodesMap.get(nodeId);
    if (!node) return;
    setEditingItem({
      kind: "node",
      id: node.id,
      name: node.name,
      label: node.label,
      properties: node.properties,
    });
    setIsEditModalOpen(true);
  };

  const openRelationshipEditor = (relationshipId: string) => {
    const relationship = graph.relationships.find((r) => r.id === relationshipId);
    if (!relationship) return;
    const source = nodesMap.get(relationship.sourceId);
    const target = nodesMap.get(relationship.targetId);
    setEditingItem({
      kind: "relationship",
      id: relationship.id,
      type: relationship.type,
      properties: relationship.properties,
      sourceName: source?.name ?? "?",
      targetName: target?.name ?? "?",
    });
    setIsEditModalOpen(true);
  };

  const enterEditMode = () => {
    nodeNamesAtEditStartRef.current = new Map(
      graph.nodes.map((node) => [node.id, node.name]),
    );
    setIsEditMode(true);
  };

  const exitEditMode = () => {
    const namesChanged = graph.nodes.some(
      (node) => nodeNamesAtEditStartRef.current.get(node.id) !== node.name,
    );
    setIsEditMode(false);
    setExpandedNodeId(null);
    setIsEditModalOpen(false);
    if (namesChanged) {
      onRefreshNodeMatches?.();
    }
  };

  const handleSaveEdit = (item: GraphItemEditPayload) => {
    if (!onGraphChange) return;

    if (item.kind === "node") {
      onGraphChange({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === item.id
            ? {
              ...node,
              name: item.name,
              properties: item.properties,
            }
            : node,
        ),
      });
      return;
    }

    onGraphChange({
      ...graph,
      relationships: graph.relationships.map((relationship) =>
        relationship.id === item.id
          ? {
            ...relationship,
            type: item.type,
            properties: item.properties,
          }
          : relationship,
      ),
    });
  };

  return (
    <>
      <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">{t("graph")}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-slate-400">
              {t("nodeRelationshipCount", {
                nodeCount: graph.nodes.length,
                relationshipCount: graph.relationships.length,
              })}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                if (isEditMode) {
                  exitEditMode();
                } else {
                  enterEditMode();
                }
                }}
                aria-label={isEditMode ? t("exitEditMode") : t("editMode")}
                aria-pressed={isEditMode}
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${isEditMode
                  ? "bg-orange-500/25 text-orange-200 ring-1 ring-orange-400/60"
                  : "text-slate-300 hover:bg-slate-700/80 hover:text-white"
                  }`}
              >
                <Pencil2Icon width={16} height={16} color="currentColor" />
              </button>
            )}
          </div>
        </div>

        {isEditMode && (
          <p className="mb-3 text-xs text-slate-500">{t("editHint")}</p>
        )}

        {graph.nodes.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {t("nodes")}
              </h3>
              {matchedNodeCount > 0 && (
                <span className="text-xs text-orange-300">
                  {t("nodeMatchCount", { count: matchedNodeCount })}
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {graph.nodes.map((node) => {
                const matches =
                  matchesByName.get(normalizeNodeName(node.name)) ?? [];
                const hasMatches = matches.length > 0;
                const isExpanded = expandedNodeId === node.id;
                const hasSourceDocumentMatch = matches.some(
                  (match) => match.sourceType === "sourceDocument",
                );
                const hasTopicSpaceMatch = matches.some(
                  (match) => match.sourceType === "topicSpace",
                );
                const highlightTone = hasSourceDocumentMatch
                  ? "orange"
                  : hasTopicSpaceMatch
                    ? "emerald"
                    : "none";

                const pillOrangeClass = isExpanded
                  ? "border-orange-400 bg-orange-500/20 text-orange-100"
                  : "border-orange-500/60 bg-orange-500/10 text-orange-100 hover:border-orange-400 hover:bg-orange-500/15";
                const pillEmeraldClass = isExpanded
                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                  : "border-emerald-500/60 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400 hover:bg-emerald-500/15";

                return (
                  <li key={node.id} className="flex flex-col gap-2">
                    {hasMatches && highlightTone === "orange" ? (
                      <EditModeTrigger
                        isEditMode={isEditMode}
                        onClick={() => openNodeEditor(node.id)}
                      >
                        <span
                          role={isEditMode ? undefined : "button"}
                          tabIndex={isEditMode ? undefined : 0}
                          aria-expanded={isEditMode ? undefined : isExpanded}
                          onClick={
                            isEditMode
                              ? undefined
                              : () =>
                                setExpandedNodeId(isExpanded ? null : node.id)
                          }
                          onKeyDown={
                            isEditMode
                              ? undefined
                              : (event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  setExpandedNodeId(
                                    isExpanded ? null : node.id,
                                  );
                                }
                              }
                          }
                          className={`inline-flex w-fit max-w-full items-center gap-2 rounded-full border px-3 py-1 text-left text-sm transition-colors ${pillOrangeClass}`}
                        >
                          <span className="truncate">{node.name}</span>
                          <span className="shrink-0 text-xs text-orange-300/60">
                            {matches.length}
                          </span>
                        </span>
                      </EditModeTrigger>
                    ) : hasMatches ? (
                      <EditModeTrigger
                        isEditMode={isEditMode}
                        onClick={() => openNodeEditor(node.id)}
                      >
                        <span
                          role={isEditMode ? undefined : "button"}
                          tabIndex={isEditMode ? undefined : 0}
                          aria-expanded={isEditMode ? undefined : isExpanded}
                          onClick={
                            isEditMode
                              ? undefined
                              : () =>
                                setExpandedNodeId(isExpanded ? null : node.id)
                          }
                          onKeyDown={
                            isEditMode
                              ? undefined
                              : (event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  setExpandedNodeId(
                                    isExpanded ? null : node.id,
                                  );
                                }
                              }
                          }
                          className={`inline-flex w-fit max-w-full items-center gap-2 rounded-full border px-3 py-1 text-left text-sm transition-colors ${pillEmeraldClass}`}
                        >
                          <span className="truncate">{node.name}</span>
                          <span className="shrink-0 text-xs text-emerald-300/50">
                            {matches.length}
                          </span>
                        </span>
                      </EditModeTrigger>
                    ) : (
                      <EditModeTrigger
                        isEditMode={isEditMode}
                        onClick={() => openNodeEditor(node.id)}
                      >
                        <span className="inline-flex w-fit max-w-full rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-sm text-slate-100">
                          {node.name}
                        </span>
                      </EditModeTrigger>
                    )}

                    {!isEditMode && hasMatches && isExpanded && (
                      <NodeMatchPreview matches={matches} />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {graph.relationships.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("relationships")}
            </h3>
            <ul className="flex flex-col gap-2">
              {graph.relationships.map((relationship) => {
                const source = nodesMap.get(relationship.sourceId);
                const target = nodesMap.get(relationship.targetId);

                return (
                  <li key={relationship.id}>
                    <EditModeTrigger
                      isEditMode={isEditMode}
                      onClick={() => openRelationshipEditor(relationship.id)}
                      className="block w-full"
                    >
                      <div className="rounded-lg bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
                        {source?.name ?? "?"} → {target?.name ?? "?"}
                        {relationship.type ? (
                          <span className="ml-2 text-xs text-slate-400">
                            ({relationship.type})
                          </span>
                        ) : null}
                      </div>
                    </EditModeTrigger>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <GraphSummaryEditModal
          isOpen={isEditModalOpen}
          setIsOpen={setIsEditModalOpen}
          item={editingItem}
          onSave={handleSaveEdit}
        />
      </section>

      {isEditMode && (
        <button
          type="button"
          onClick={exitEditMode}
          aria-label={t("exitEditMode")}
          className="fixed bottom-6 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg ring-2 ring-white/20 transition hover:bg-emerald-500 active:scale-95"
        >
          <CheckIcon width={24} height={24} color="white" />
        </button>
      )}
    </>
  );
}
