import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  WRITING_USAGE_LOG_ALL_DEFAULT,
  WRITING_USAGE_LOG_ALL_MAX,
  clampUsageLogAllTake,
  listWritingUsageLogBySources,
  parseUsageLogAllCursor,
  parseUsageLogAllSources,
} from "./external-workspace";

describe("parseUsageLogAllSources", () => {
  it("splits, trims, and dedupes sources", () => {
    expect(
      parseUsageLogAllSources("sos-research, sos-research-concept,sos-research"),
    ).toEqual(["sos-research", "sos-research-concept"]);
  });

  it("returns empty for missing or blank input", () => {
    expect(parseUsageLogAllSources(null)).toEqual([]);
    expect(parseUsageLogAllSources(undefined)).toEqual([]);
    expect(parseUsageLogAllSources("  ,  ")).toEqual([]);
  });
});

describe("parseUsageLogAllCursor", () => {
  it("returns null when both params are absent", () => {
    expect(parseUsageLogAllCursor({ createdAt: null, id: null })).toBeNull();
  });

  it("requires both createdAt and id", () => {
    expect(() =>
      parseUsageLogAllCursor({ createdAt: "2026-10-13T00:00:00.000Z", id: null }),
    ).toThrow(/both required/);
  });

  it("normalizes a valid cursor", () => {
    expect(
      parseUsageLogAllCursor({
        createdAt: "2026-10-13T10:00:00.000Z",
        id: "h1",
      }),
    ).toEqual({ createdAt: "2026-10-13T10:00:00.000Z", id: "h1" });
  });
});

describe("clampUsageLogAllTake", () => {
  it("defaults to 2000 and caps at 5000", () => {
    expect(clampUsageLogAllTake(undefined)).toBe(WRITING_USAGE_LOG_ALL_DEFAULT);
    expect(clampUsageLogAllTake(Number.NaN)).toBe(WRITING_USAGE_LOG_ALL_DEFAULT);
    expect(clampUsageLogAllTake(0)).toBe(1);
    expect(clampUsageLogAllTake(100)).toBe(100);
    expect(clampUsageLogAllTake(10_000)).toBe(WRITING_USAGE_LOG_ALL_MAX);
  });
});

function doc(text: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

function historyRow(input: {
  id: string;
  workspaceId: string;
  createdAt: string;
  source: string;
  sourceKey: string;
  title: string;
}) {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    changeDescription: "保存しました",
    previousContent: doc("a"),
    currentContent: doc("ab"),
    previousGraph: null,
    currentGraph: null,
    createdAt: new Date(input.createdAt),
    changedBy: { id: "u1", name: "松野", image: null },
    workspace: {
      id: input.workspaceId,
      source: input.source,
      sourceKey: input.sourceKey,
      name: input.title,
      content: doc("ab"),
      curatorialContext: null,
      updatedAt: new Date(input.createdAt),
    },
  };
}

describe("listWritingUsageLogBySources", () => {
  it("filters sources, truncates, and skips workspaces without sourceKey", async () => {
    const rows = [
      historyRow({
        id: "h1",
        workspaceId: "ws-ok",
        createdAt: "2026-10-13T10:00:00.000Z",
        source: "sos-research",
        sourceKey: "slug-a",
        title: "小項目A",
      }),
      historyRow({
        id: "h2",
        workspaceId: "ws-missing",
        createdAt: "2026-10-13T09:00:00.000Z",
        source: "sos-research",
        sourceKey: "  ",
        title: "欠落",
      }),
      historyRow({
        id: "h3",
        workspaceId: "ws-concept",
        createdAt: "2026-10-13T08:00:00.000Z",
        source: "sos-research-concept",
        sourceKey: "node-1",
        title: "概念1",
      }),
    ];

    const db = {
      writingHistory: {
        findMany: async (args: { take?: number }) => rows.slice(0, args.take),
      },
    } as unknown as PrismaClient;

    const result = await listWritingUsageLogBySources({
      db,
      userId: "u1",
      sources: ["sos-research", "sos-research-concept"],
      take: 2,
    });

    expect(result.truncated).toBe(true);
    expect(result.nextBefore).toEqual({
      createdAt: "2026-10-13T09:00:00.000Z",
      id: "h2",
    });
    expect(result.histories.map((item) => item.sourceKey)).toEqual(["slug-a"]);
    expect(result.histories[0]?.title).toBe("小項目A");
    expect(result.histories[0]?.source).toBe("sos-research");
  });

  it("passes before cursor into the query and omits current-save on later pages", async () => {
    const captured: unknown[] = [];
    const row = historyRow({
      id: "h9",
      workspaceId: "ws-ok",
      createdAt: "2026-10-12T00:00:00.000Z",
      source: "sos-research",
      sourceKey: "slug-a",
      title: "小項目A",
    });
    const db = {
      writingHistory: {
        findMany: async (args: unknown) => {
          captured.push(args);
          return [row];
        },
      },
    } as unknown as PrismaClient;

    const result = await listWritingUsageLogBySources({
      db,
      userId: "u1",
      sources: ["sos-research"],
      take: 10,
      before: { createdAt: "2026-10-13T10:00:00.000Z", id: "h1" },
    });

    expect(result.truncated).toBe(false);
    expect(result.nextBefore).toBeNull();
    expect(result.histories.every((item) => !item.id.startsWith("unrecorded:"))).toBe(
      true,
    );
    const where = (captured[0] as { where: { OR?: unknown } }).where;
    expect(where.OR).toBeTruthy();
  });

  it("rejects empty sources", async () => {
    const db = { writingHistory: { findMany: async () => [] } } as unknown as PrismaClient;
    await expect(
      listWritingUsageLogBySources({
        db,
        userId: "u1",
        sources: [],
      }),
    ).rejects.toThrow("sources query is required");
  });
});
