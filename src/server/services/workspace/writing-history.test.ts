import { describe, expect, it } from "vitest";
import {
  jsonContentEquals,
  shouldRecordWritingHistory,
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
  });
});
