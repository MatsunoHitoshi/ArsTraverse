"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import type { PublishedNodeMatch } from "@/server/api/schemas/scan";

type GraphSummaryProps = {
  graph: GraphDocumentForFrontend;
  matchCandidates?: PublishedNodeMatch[];
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
  const topicSpaceMatches = matches.filter(
    (match) => match.sourceType === "topicSpace",
  );
  const sourceDocumentMatches = matches.filter(
    (match) => match.sourceType === "sourceDocument",
  );
  const workspaceMatches = matches.filter(
    (match) => match.sourceType === "workspace",
  );

  return (
    <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-3">
      <p className="mb-2 text-xs font-medium text-orange-300">
        一致候補 ({matches.length})
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
                {match.topicSpaceName ?? "トピックスペース"} を開く
              </Link>
            ) : match.sourceType === "sourceDocument" &&
              match.sourceDocumentId ? (
              <Link
                href={`/documents/${match.sourceDocumentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-orange-300 underline-offset-2 hover:underline"
              >
                {match.sourceDocumentName ?? "ドキュメント"} を開く
              </Link>
            ) : match.sourceType === "workspace" && match.workspaceId ? (
              <Link
                href={`/workspaces/${match.workspaceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-sky-400 underline-offset-2 hover:underline"
              >
                {match.workspaceName ?? "ワークスペース"} を開く
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {(topicSpaceMatches.length > 0 ||
        sourceDocumentMatches.length > 0 ||
        workspaceMatches.length > 0) && (
        <p className="mt-2 text-xs text-slate-400">
          トピックスペース {topicSpaceMatches.length} 件 / ドキュメント{" "}
          {sourceDocumentMatches.length} 件
          {workspaceMatches.length > 0
            ? ` / 公開グラフ ${workspaceMatches.length} 件`
            : ""}
        </p>
      )}
    </div>
  );
}

export function GraphSummary({
  graph,
  matchCandidates = [],
}: GraphSummaryProps) {
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const nodesMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const matchesByName = useMemo(
    () => groupMatchesByName(matchCandidates),
    [matchCandidates],
  );
  const matchedNodeCount = graph.nodes.filter(
    (node) => (matchesByName.get(normalizeNodeName(node.name))?.length ?? 0) > 0,
  ).length;

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-200">グラフ</h2>
        <span className="text-xs text-slate-400">
          ノード {graph.nodes.length} · 関係 {graph.relationships.length}
        </span>
      </div>

      {graph.nodes.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
              ノード
            </h3>
            {matchedNodeCount > 0 && (
              <span className="text-xs text-orange-300">
                {matchedNodeCount} 件が既存データと一致
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

              return (
                <li key={node.id} className="flex flex-col gap-2">
                  {hasMatches && highlightTone === "orange" ? (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedNodeId(isExpanded ? null : node.id)
                      }
                      className={`inline-flex w-fit max-w-full items-center gap-2 rounded-full border px-3 py-1 text-left text-sm transition-colors ${isExpanded
                        ? "border-orange-400 bg-orange-500/20 text-orange-100"
                        : "border-orange-500/60 bg-orange-500/10 text-orange-100 hover:border-orange-400 hover:bg-orange-500/15"
                        }`}
                    >
                      <span className="truncate">{node.name}</span>
                      <span className="shrink-0 text-xs text-orange-300/60">
                        {matches.length}
                      </span>
                    </button>
                  ) : hasMatches ? (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedNodeId(isExpanded ? null : node.id)
                      }
                      className={`inline-flex w-fit max-w-full items-center gap-2 rounded-full border px-3 py-1 text-left text-sm transition-colors ${isExpanded
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                        : "border-emerald-500/60 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400 hover:bg-emerald-500/15"
                        }`}
                    >
                      <span className="truncate">{node.name}</span>
                      <span className="shrink-0 text-xs text-emerald-300/50">
                        {matches.length}
                      </span>
                    </button>
                  ) : (
                    <span className="inline-flex w-fit max-w-full rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-sm text-slate-100">
                      {node.name}
                    </span>
                  )}

                  {hasMatches && isExpanded && (
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
            関係
          </h3>
          <ul className="flex flex-col gap-2">
            {graph.relationships.map((relationship) => {
              const source = nodesMap.get(relationship.sourceId);
              const target = nodesMap.get(relationship.targetId);
              return (
                <li
                  key={relationship.id}
                  className="rounded-lg bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
                >
                  {source?.name ?? "?"} → {target?.name ?? "?"}
                  {relationship.type ? (
                    <span className="ml-2 text-xs text-slate-400">
                      ({relationship.type})
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
