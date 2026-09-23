import type { Prisma, PrismaClient } from "@prisma/client";
import {
  defaultWritingHistoryDescription,
  liveGraphsEqual,
} from "./workspace-graph-history";

export const DEFAULT_WRITING_HISTORY_INTERVAL_MS = 30_000;

export function stableJsonString(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function jsonContentEquals(a: unknown, b: unknown): boolean {
  if (stableJsonString(a) === stableJsonString(b)) {
    return true;
  }
  const plainA = tiptapPlainTextPreview(a, 1_000_000);
  const plainB = tiptapPlainTextPreview(b, 1_000_000);
  return plainA === plainB;
}

function walkTipTapText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof record.text === "string") return record.text;
  if (!Array.isArray(record.content)) return "";
  const joiner =
    record.type === "doc" ||
    record.type === "bulletList" ||
    record.type === "orderedList"
      ? "\n"
      : record.type === "paragraph" || record.type === "heading"
        ? "\n"
        : "";
  return record.content.map(walkTipTapText).filter(Boolean).join(joiner || "");
}

/** 段落改行を残した本文。差分表示用 */
export function tiptapPlainText(content: unknown): string {
  return walkTipTapText(content)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function tiptapPlainTextPreview(
  content: unknown,
  maxLength = 160,
): string {
  const text = tiptapPlainText(content).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

export function shouldRecordWritingHistory(input: {
  previousContent: unknown;
  currentContent: unknown;
  previousGraph?: unknown;
  currentGraph?: unknown;
  lastRecordedAt: Date | null;
  now?: Date;
  intervalMs?: number;
  force?: boolean;
}): boolean {
  const contentChanged = !jsonContentEquals(
    input.previousContent,
    input.currentContent,
  );
  const graphChanged = !liveGraphsEqual(
    input.previousGraph,
    input.currentGraph,
  );
  if (!contentChanged && !graphChanged) {
    return false;
  }
  if (input.force) return true;
  if (!input.lastRecordedAt) return true;
  const now = input.now ?? new Date();
  const interval = input.intervalMs ?? DEFAULT_WRITING_HISTORY_INTERVAL_MS;
  return now.getTime() - input.lastRecordedAt.getTime() >= interval;
}

export async function recordWritingHistoryIfNeeded(input: {
  db: PrismaClient;
  workspaceId: string;
  previousContent: unknown;
  currentContent: unknown;
  previousGraph?: unknown;
  currentGraph?: unknown;
  changedById: string;
  changeDescription?: string;
  force?: boolean;
  intervalMs?: number;
}): Promise<{ recorded: boolean; historyId?: string }> {
  const latest = await input.db.writingHistory.findFirst({
    where: { workspaceId: input.workspaceId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const contentChanged = !jsonContentEquals(
    input.previousContent,
    input.currentContent,
  );
  const graphChanged = !liveGraphsEqual(
    input.previousGraph,
    input.currentGraph,
  );

  const shouldRecord = shouldRecordWritingHistory({
    previousContent: input.previousContent,
    currentContent: input.currentContent,
    previousGraph: input.previousGraph,
    currentGraph: input.currentGraph,
    lastRecordedAt: latest?.createdAt ?? null,
    force: input.force,
    intervalMs: input.intervalMs,
  });

  if (!shouldRecord) {
    return { recorded: false };
  }

  const history = await input.db.writingHistory.create({
    data: {
      workspaceId: input.workspaceId,
      previousContent:
        (input.previousContent as Prisma.InputJsonValue) ?? undefined,
      currentContent:
        (input.currentContent as Prisma.InputJsonValue) ?? undefined,
      previousGraph:
        (input.previousGraph as Prisma.InputJsonValue) ?? undefined,
      currentGraph:
        (input.currentGraph as Prisma.InputJsonValue) ?? undefined,
      changeDescription:
        input.changeDescription ??
        defaultWritingHistoryDescription({ contentChanged, graphChanged }),
      changedById: input.changedById,
    },
    select: { id: true },
  });

  return { recorded: true, historyId: history.id };
}

export type WritingHistorySnapshotSource = {
  id: string;
  createdAt: Date | string;
  currentContent?: unknown;
  previousGraph?: unknown;
  currentGraph?: unknown;
};

function historyTime(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

function compareHistoryOrder(
  left: WritingHistorySnapshotSource,
  right: WritingHistorySnapshotSource,
): number {
  const delta = historyTime(left.createdAt) - historyTime(right.createdAt);
  if (delta !== 0) return delta;
  return left.id.localeCompare(right.id);
}

/** その版の保存時点のグラフ。この行に無ければ前後の履歴から補う。 */
export function resolveWritingHistoryGraph(input: {
  history: WritingHistorySnapshotSource;
  timeline?: WritingHistorySnapshotSource[];
}): unknown {
  if (input.history.currentGraph != null) return input.history.currentGraph;
  if (input.history.previousGraph != null) return input.history.previousGraph;

  const timeline = [...(input.timeline ?? [])].sort(compareHistoryOrder);
  const index = timeline.findIndex((item) => item.id === input.history.id);
  if (index < 0) return null;

  for (let i = index - 1; i >= 0; i -= 1) {
    const older = timeline[i];
    if (older?.currentGraph != null) return older.currentGraph;
  }
  for (let i = index + 1; i < timeline.length; i += 1) {
    const newer = timeline[i];
    if (newer?.previousGraph != null) return newer.previousGraph;
  }
  return null;
}

/** その版の保存時点の本文とグラフ。差分の一部ではなく、その時点の全体。 */
export function resolveWritingHistorySnapshot(input: {
  history: WritingHistorySnapshotSource;
  timeline?: WritingHistorySnapshotSource[];
}): { content: unknown; graph: unknown } {
  return {
    content: input.history.currentContent ?? null,
    graph: resolveWritingHistoryGraph(input),
  };
}
