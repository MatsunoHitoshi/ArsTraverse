import { describe, expect, it } from "vitest";
import {
  CURRENT_SAVE_DESCRIPTION,
  UNRECORDED_INTERVAL_DESCRIPTION,
  expandUsageLogEntries,
  type UsageLogHistorySnapshot,
} from "./usage-log-entries";

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

function graph(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.0",
    updatedAt: "2026-09-22T08:30:00.000Z",
    nodes: [],
    relationships: [],
    provenance: { nodes: [], relationships: [] },
    blockExtractions: {},
    ...overrides,
  };
}

function history(
  overrides: Partial<UsageLogHistorySnapshot> & Pick<UsageLogHistorySnapshot, "id" | "createdAt">,
): UsageLogHistorySnapshot {
  return {
    workspaceId: "ws-1",
    changeDescription: "グラフを抽出しました",
    previousContent: doc("短い本文"),
    currentContent: doc("短い本文"),
    previousGraph: graph(),
    currentGraph: graph(),
    changedBy: { id: "user-1", name: "松野", image: null },
    ...overrides,
  };
}

const gallery = {
  id: "gallery",
  name: "ギャラリー",
  label: "Concept",
  properties: { graphEdit: "added" },
};

describe("expandUsageLogEntries", () => {
  it("inserts a manual node that arrived between two snapshots", () => {
    const older = history({
      id: "h1",
      createdAt: new Date("2026-09-22T08:30:13.000Z"),
      currentGraph: graph({ nodes: [] }),
    });
    const newer = history({
      id: "h2",
      createdAt: new Date("2026-09-22T08:30:40.000Z"),
      previousGraph: graph({
        nodes: [gallery],
        edits: {
          addedNodes: [
            {
              nodeId: "gallery",
              name: "ギャラリー",
              label: "Concept",
              evidence: { blockId: "b1", quote: "ギャラリー" },
            },
          ],
        },
      }),
      currentGraph: graph({
        nodes: [gallery],
        edits: {
          addedNodes: [
            {
              nodeId: "gallery",
              name: "ギャラリー",
              label: "Concept",
              evidence: { blockId: "b1", quote: "ギャラリー" },
            },
          ],
        },
      }),
    });

    const entries = expandUsageLogEntries({ histories: [newer, older] });
    const gap = entries.find((entry) => entry.id === "unrecorded:h1:h2");
    expect(gap?.changeDescription).toBe(UNRECORDED_INTERVAL_DESCRIPTION);
    expect(gap?.graphEvents).toEqual([
      expect.objectContaining({
        kind: "node",
        change: "added",
        origin: "manual",
        name: "ギャラリー",
      }),
    ]);
    expect(entries.map((entry) => entry.id)).toEqual([
      "h2",
      "unrecorded:h1:h2",
      "h1",
    ]);
  });

  it("shows a text jump that was saved before the next snapshot", () => {
    const older = history({
      id: "h1",
      createdAt: new Date("2026-09-22T04:16:44.000Z"),
      previousContent: doc("世代の変遷と運営の持続"),
      currentContent: doc("世代の変遷と運営の持続"),
    });
    const newer = history({
      id: "h2",
      createdAt: new Date("2026-09-22T04:17:03.000Z"),
      previousContent: doc("世代の文章"),
      currentContent: doc("世代の文章"),
    });
    const entries = expandUsageLogEntries({ histories: [older, newer] });
    const gap = entries.find((entry) => entry.id === "unrecorded:h1:h2");
    expect(gap?.previousText).toBe("世代の変遷と運営の持続");
    expect(gap?.currentText).toBe("世代の文章");
  });

  it("adds the current saved graph when it is ahead of the last history", () => {
    const latest = history({
      id: "h1",
      createdAt: new Date("2026-09-22T08:30:13.000Z"),
    });
    const entries = expandUsageLogEntries({
      histories: [latest],
      workspace: {
        workspaceId: "ws-1",
        content: doc("短い本文"),
        graph: graph({
          nodes: [gallery],
          edits: {
            addedNodes: [
              {
                nodeId: "gallery",
                name: "ギャラリー",
                label: "Concept",
                evidence: { blockId: "b1", quote: "ギャラリー" },
              },
            ],
          },
        }),
        updatedAt: new Date("2026-09-22T08:31:00.000Z"),
      },
    });
    expect(entries[0]?.changeDescription).toBe(CURRENT_SAVE_DESCRIPTION);
    expect(entries[0]?.id).toBe("unrecorded:workspace");
    expect(entries[0]?.graphEvents).toEqual([
      expect.objectContaining({
        origin: "manual",
        name: "ギャラリー",
        change: "added",
      }),
    ]);
  });
});
