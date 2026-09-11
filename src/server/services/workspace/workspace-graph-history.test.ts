import { describe, expect, it } from "vitest";
import {
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
