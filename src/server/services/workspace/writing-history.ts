import type { Prisma, PrismaClient } from "@prisma/client";

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

export function tiptapPlainTextPreview(
  content: unknown,
  maxLength = 160,
): string {
  const walk = (node: unknown): string => {
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
    return record.content.map(walk).filter(Boolean).join(joiner || "");
  };

  const text = walk(content).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

export function shouldRecordWritingHistory(input: {
  previousContent: unknown;
  currentContent: unknown;
  lastRecordedAt: Date | null;
  now?: Date;
  intervalMs?: number;
  force?: boolean;
}): boolean {
  if (jsonContentEquals(input.previousContent, input.currentContent)) {
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

  const shouldRecord = shouldRecordWritingHistory({
    previousContent: input.previousContent,
    currentContent: input.currentContent,
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
      changeDescription: input.changeDescription ?? "内容を更新しました",
      changedById: input.changedById,
    },
    select: { id: true },
  });

  return { recorded: true, historyId: history.id };
}
