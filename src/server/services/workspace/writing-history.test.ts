import { describe, expect, it } from "vitest";
import {
  jsonContentEquals,
  resolveWritingHistorySnapshot,
  shouldRecordWritingHistory,
  tiptapPlainText,
  tiptapPlainTextPreview,
} from "./writing-history";

describe("jsonContentEquals", () => {
  it("treats equivalent TipTap docs as equal", () => {
    const a = { type: "doc", content: [{ type: "paragraph", content: [] }] };
    const b = { type: "doc", content: [{ type: "paragraph", content: [] }] };
    expect(jsonContentEquals(a, b)).toBe(true);
  });

  it("treats equivalent TipTap plain text as equal when JSON differs", () => {
    const a = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "block-a" },
          content: [{ type: "text", text: "hello" }],
        },
      ],
    };
    const b = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { blockId: "block-b" },
          content: [{ type: "text", text: "hello" }],
        },
      ],
    };
    expect(jsonContentEquals(a, b)).toBe(true);
  });

  it("detects a text change", () => {
    const a = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }],
    };
    const b = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }],
    };
    expect(jsonContentEquals(a, b)).toBe(false);
  });
});

describe("shouldRecordWritingHistory", () => {
  const previous = { type: "doc", content: [] };
  const current = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
  };

  it("records the first snapshot", () => {
    expect(
      shouldRecordWritingHistory({
        previousContent: previous,
        currentContent: current,
        lastRecordedAt: null,
      }),
    ).toBe(true);
  });

  it("skips identical content even when forced", () => {
    expect(
      shouldRecordWritingHistory({
        previousContent: current,
        currentContent: current,
        lastRecordedAt: null,
        force: true,
      }),
    ).toBe(false);
  });

  it("throttles autosave snapshots", () => {
    const lastRecordedAt = new Date("2026-08-31T00:00:00.000Z");
    expect(
      shouldRecordWritingHistory({
        previousContent: previous,
        currentContent: current,
        lastRecordedAt,
        now: new Date("2026-08-31T00:00:10.000Z"),
        intervalMs: 30_000,
      }),
    ).toBe(false);
    expect(
      shouldRecordWritingHistory({
        previousContent: previous,
        currentContent: current,
        lastRecordedAt,
        now: new Date("2026-08-31T00:00:30.000Z"),
        intervalMs: 30_000,
      }),
    ).toBe(true);
  });

  it("records immediately when force is set", () => {
    expect(
      shouldRecordWritingHistory({
        previousContent: previous,
        currentContent: current,
        lastRecordedAt: new Date("2026-08-31T00:00:00.000Z"),
        now: new Date("2026-08-31T00:00:01.000Z"),
        force: true,
      }),
    ).toBe(true);
  });

  it("records graph-only changes", () => {
    expect(
      shouldRecordWritingHistory({
        previousContent: current,
        currentContent: current,
        previousGraph: { nodes: [], relationships: [] },
        currentGraph: {
          nodes: [{ id: "n1", name: "桶屋", label: "Studio" }],
          relationships: [],
        },
        lastRecordedAt: null,
      }),
    ).toBe(true);
  });

  it("skips identical graphs even when timestamps differ", () => {
    const graph = {
      updatedAt: "2026-09-11T00:00:00.000Z",
      nodes: [{ id: "n1", name: "桶屋", label: "Studio" }],
      relationships: [],
    };
    expect(
      shouldRecordWritingHistory({
        previousContent: current,
        currentContent: current,
        previousGraph: graph,
        currentGraph: { ...graph, updatedAt: "2026-09-11T00:01:00.000Z" },
        lastRecordedAt: null,
        force: true,
      }),
    ).toBe(false);
  });
});

describe("resolveWritingHistorySnapshot", () => {
  const studio = {
    nodes: [{ id: "n1", name: "桶屋", label: "Studio" }],
    relationships: [],
    edits: { nodeLabels: [{ key: "桶屋", name: "桶屋", label: "Studio" }] },
  };
  const place = {
    nodes: [{ id: "n1", name: "桶屋", label: "Place" }],
    relationships: [],
    edits: { nodeLabels: [{ key: "桶屋", name: "桶屋", label: "Place" }] },
  };

  it("restores the saved graph at that version, including labels", () => {
    const older = {
      id: "h1",
      createdAt: "2026-09-01T00:00:00.000Z",
      currentContent: { type: "doc", content: [] },
      currentGraph: studio,
    };
    const newer = {
      id: "h2",
      createdAt: "2026-09-01T00:01:00.000Z",
      currentContent: { type: "doc", content: [] },
      previousGraph: studio,
      currentGraph: place,
    };

    expect(
      resolveWritingHistorySnapshot({
        history: older,
        timeline: [newer, older],
      }),
    ).toEqual({ content: older.currentContent, graph: studio });
    expect(
      resolveWritingHistorySnapshot({
        history: newer,
        timeline: [newer, older],
      }),
    ).toEqual({ content: newer.currentContent, graph: place });
  });

  it("does not treat previousGraph as the saved graph when currentGraph is missing", () => {
    const cleared = {
      id: "h2",
      createdAt: "2026-09-01T00:01:00.000Z",
      currentContent: { type: "doc", content: [] },
      previousGraph: studio,
    };

    expect(
      resolveWritingHistorySnapshot({
        history: cleared,
        timeline: [
          {
            id: "h1",
            createdAt: "2026-09-01T00:00:00.000Z",
            currentGraph: studio,
          },
          cleared,
        ],
      }).graph,
    ).toBeNull();
  });

  it("does not walk past a previousGraph-only row when filling a legacy snapshot", () => {
    const legacy = {
      id: "h3",
      createdAt: "2026-09-01T00:02:00.000Z",
      currentContent: { type: "doc", content: [] },
    };

    expect(
      resolveWritingHistorySnapshot({
        history: legacy,
        timeline: [
          {
            id: "h1",
            createdAt: "2026-09-01T00:00:00.000Z",
            currentGraph: studio,
          },
          {
            id: "h2",
            createdAt: "2026-09-01T00:01:00.000Z",
            previousGraph: studio,
          },
          legacy,
        ],
      }).graph,
    ).toBeNull();
  });

  it("fills a missing graph from the nearest snapshot on the timeline", () => {
    const textOnly = {
      id: "h2",
      createdAt: "2026-09-01T00:01:00.000Z",
      currentContent: { type: "doc", content: [] },
    };
    const older = {
      id: "h1",
      createdAt: "2026-09-01T00:00:00.000Z",
      currentGraph: studio,
    };
    const newer = {
      id: "h3",
      createdAt: "2026-09-01T00:02:00.000Z",
      previousGraph: place,
      currentGraph: place,
    };

    expect(
      resolveWritingHistorySnapshot({
        history: textOnly,
        timeline: [newer, textOnly, older],
      }).graph,
    ).toBe(studio);
    expect(
      resolveWritingHistorySnapshot({
        history: { ...textOnly, id: "orphan" },
        timeline: [newer],
      }).graph,
    ).toBeNull();
  });
});

describe("tiptapPlainTextPreview", () => {
  it("flattens paragraphs into a preview string", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          content: [{ type: "text", text: "美術大学と美大生" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "相模原市は美大生のまちです。" }],
        },
      ],
    };
    expect(tiptapPlainTextPreview(doc)).toBe(
      "美術大学と美大生 相模原市は美大生のまちです。",
    );
    expect(tiptapPlainText(doc)).toBe(
      "美術大学と美大生\n相模原市は美大生のまちです。",
    );
  });
});
