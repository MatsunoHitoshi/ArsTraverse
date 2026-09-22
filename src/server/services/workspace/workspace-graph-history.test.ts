import { describe, expect, it } from "vitest";
import {
  classifyGraphEvents,
  diffLiveGraphs,
  liveGraphsEqual,
  readLiveGraphFromCuratorialContext,
  summarizeWorkspaceGraphDiff,
  withLiveGraphInCuratorialContext,
} from "./workspace-graph-history";

const previous = {
  version: "1.0",
  updatedAt: "2026-09-11T00:00:00.000Z",
  extractGeneration: 1,
  nodes: [
    { id: "n1", name: "桶屋", label: "Studio", properties: {} },
    { id: "n2", name: "高石優真", label: "Person", properties: {} },
  ],
  relationships: [
    {
      id: "r1",
      type: "PARTICIPATES_IN",
      sourceId: "n2",
      targetId: "n1",
      properties: {},
    },
  ],
  provenance: { nodes: [], relationships: [] },
  blockExtractions: {},
};

const current = {
  ...previous,
  updatedAt: "2026-09-11T00:01:00.000Z",
  nodes: [
    { id: "n1", name: "桶屋スタジオ", label: "Studio", properties: {} },
    { id: "n3", name: "相模原", label: "Place", properties: {} },
  ],
  relationships: [
    {
      id: "r2",
      type: "LOCATED_IN",
      sourceId: "n1",
      targetId: "n3",
      properties: {},
    },
  ],
};

describe("liveGraphsEqual", () => {
  it("ignores updatedAt", () => {
    expect(
      liveGraphsEqual(previous, { ...previous, updatedAt: "later" }),
    ).toBe(true);
  });

  it("detects node changes", () => {
    expect(liveGraphsEqual(previous, current)).toBe(false);
  });
});

describe("diffLiveGraphs", () => {
  it("reports added, removed, and updated entities", () => {
    const diff = diffLiveGraphs(previous, current);
    expect(diff.summary).toMatchObject({
      addedNodeCount: 1,
      removedNodeCount: 1,
      updatedNodeCount: 1,
      addedRelationshipCount: 1,
      removedRelationshipCount: 1,
    });
    expect(diff.nodes.find((item) => item.change === "added")?.name).toBe(
      "相模原",
    );
    expect(diff.nodes.find((item) => item.change === "removed")?.name).toBe(
      "高石優真",
    );
    expect(diff.nodes.find((item) => item.change === "updated")).toMatchObject({
      previousName: "桶屋",
      name: "桶屋スタジオ",
    });
    expect(summarizeWorkspaceGraphDiff(diff)).toContain("+1ノード");
    expect(summarizeWorkspaceGraphDiff(diff)).toContain("−1ノード");
  });

  it("flags metadata-only changes", () => {
    const diff = diffLiveGraphs(previous, {
      ...previous,
      extractGeneration: 2,
    });
    expect(diff.nodes).toHaveLength(0);
    expect(diff.relationships).toHaveLength(0);
    expect(diff.summary.metaChanged).toBe(true);
    expect(summarizeWorkspaceGraphDiff(diff)).toBe("抽出の紐付けを更新");
  });
});

function blankGraph(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.0",
    updatedAt: "2026-09-11T00:00:00.000Z",
    nodes: [],
    relationships: [],
    provenance: { nodes: [], relationships: [] },
    blockExtractions: {},
    ...overrides,
  };
}

describe("classifyGraphEvents", () => {
  it("marks a sketch-mode node as sketch", () => {
    const events = classifyGraphEvents(
      blankGraph(),
      blankGraph({
        nodes: [
          {
            id: "s1",
            name: "仮の語",
            label: "Concept",
            properties: { graphEdit: "sketch" },
          },
        ],
        edits: {
          sketches: {
            nodes: [{ nodeId: "s1", name: "仮の語", label: "Concept" }],
            relationships: [],
          },
        },
      }),
    );
    expect(events).toEqual([
      expect.objectContaining({
        kind: "node",
        change: "added",
        origin: "sketch",
        id: "s1",
        name: "仮の語",
      }),
    ]);
  });

  it("marks an extraction-backed node as llm", () => {
    const events = classifyGraphEvents(
      blankGraph(),
      blankGraph({
        nodes: [
          { id: "l1", name: "相模原", label: "Place", properties: {} },
        ],
        provenance: {
          nodes: [{ nodeId: "l1", blockIds: ["b1"] }],
          relationships: [],
        },
        blockExtractions: {
          b1: {
            text: "相模原",
            nodeIds: ["l1"],
            relationshipIds: [],
            extractedAt: "2026-09-11T00:00:00.000Z",
          },
        },
      }),
    );
    expect(events).toEqual([
      expect.objectContaining({
        kind: "node",
        change: "added",
        origin: "llm",
        id: "l1",
        name: "相模原",
      }),
    ]);
  });

  it("marks a quote-backed manual node as manual", () => {
    const events = classifyGraphEvents(
      blankGraph(),
      blankGraph({
        nodes: [
          {
            id: "m1",
            name: "手で足した語",
            label: "Concept",
            properties: { graphEdit: "added" },
          },
        ],
        edits: {
          addedNodes: [
            {
              nodeId: "m1",
              name: "手で足した語",
              label: "Concept",
              evidence: { blockId: "b1", quote: "手で足した語" },
            },
          ],
        },
      }),
    );
    expect(events).toEqual([
      expect.objectContaining({
        kind: "node",
        change: "added",
        origin: "manual",
        id: "m1",
      }),
    ]);
  });

  it("marks a sketch that gains block evidence as promoted", () => {
    const sketch = blankGraph({
      nodes: [
        {
          id: "s1",
          name: "仮の語",
          label: "Concept",
          properties: { graphEdit: "sketch" },
        },
      ],
      edits: {
        sketches: {
          nodes: [{ nodeId: "s1", name: "仮の語", label: "Concept" }],
          relationships: [],
        },
      },
    });
    const clean = blankGraph({
      nodes: [
        { id: "s1", name: "仮の語", label: "Concept", properties: {} },
      ],
      provenance: {
        nodes: [{ nodeId: "s1", blockIds: ["b1"] }],
        relationships: [],
      },
      blockExtractions: {
        b1: {
          text: "仮の語",
          nodeIds: ["s1"],
          relationshipIds: [],
          extractedAt: "2026-09-11T00:01:00.000Z",
        },
      },
    });
    const events = classifyGraphEvents(sketch, clean);
    expect(events).toEqual([
      expect.objectContaining({
        kind: "node",
        change: "promoted",
        origin: "sketch",
        id: "s1",
      }),
    ]);
    expect(events.some((event) => event.change === "updated")).toBe(false);
  });

  it("marks an existing node when a manual edit is attached", () => {
    const before = blankGraph({
      nodes: [{ id: "m1", name: "ギャラリー", label: "Concept", properties: {} }],
      provenance: {
        nodes: [{ nodeId: "m1", blockIds: ["b1"] }],
        relationships: [],
      },
    });
    const after = blankGraph({
      nodes: [{ id: "m1", name: "ギャラリー", label: "Concept", properties: {} }],
      provenance: {
        nodes: [{ nodeId: "m1", blockIds: ["b1"] }],
        relationships: [],
      },
      edits: {
        addedNodes: [
          {
            nodeId: "m1",
            name: "ギャラリー",
            label: "Concept",
            evidence: { blockId: "b1", quote: "ギャラリー" },
          },
        ],
      },
    });
    const events = classifyGraphEvents(before, after);
    expect(events).toEqual([
      expect.objectContaining({
        kind: "node",
        change: "updated",
        origin: "manual",
        id: "m1",
        name: "ギャラリー",
      }),
    ]);
  });
});

describe("curatorialContext liveGraph", () => {
  it("reads and writes sosWriting.liveGraph", () => {
    const context = {
      sosWriting: { slug: "demo", liveGraph: previous },
    };
    expect(readLiveGraphFromCuratorialContext(context)).toEqual(previous);
    const next = withLiveGraphInCuratorialContext(context, current);
    expect(readLiveGraphFromCuratorialContext(next)).toEqual(current);
    expect(
      (next.sosWriting as { slug: string }).slug,
    ).toBe("demo");
  });
});
