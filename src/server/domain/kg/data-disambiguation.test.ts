import { describe, expect, it } from "vitest";
import type { GraphNode, GraphRelationship } from "@prisma/client";
import { dataDisambiguation, fuseGraphs } from "./data-disambiguation";

function node(
  id: string,
  name: string,
  label: string,
  properties: Record<string, string> = {},
): GraphNode {
  return {
    id,
    name,
    label,
    properties,
    documentGraphId: null,
    topicSpaceId: null,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
  } as unknown as GraphNode;
}

function rel(
  id: string,
  type: string,
  fromNodeId: string,
  toNodeId: string,
): GraphRelationship {
  return {
    id,
    type,
    properties: {},
    fromNodeId,
    toNodeId,
    documentGraphId: null,
    topicSpaceId: null,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
  } as unknown as GraphRelationship;
}

describe("fuseGraphs (integrate scenario)", () => {
  it("does not duplicate a node when languages of the raw name differ", async () => {
    // 既存(topicSpace)ノード: 生 name が英語
    const sourceGraph = {
      nodes: [
        node("existing-art", "ART PROJECT", "Concept", {
          name_ja: "アートプロジェクト",
          name_en: "ART PROJECT",
        }),
      ],
      relationships: [],
    };

    // 新規抽出(統合ペイロード): 同じ概念だが生 name は日本語 + 新規ノード + エッジ
    const targetGraph = {
      nodes: [
        node("incoming-art", "アートプロジェクト", "Concept", {
          name_ja: "アートプロジェクト",
          name_en: "ART PROJECT",
        }),
        node("incoming-exhibition", "展覧会", "Event", {
          name_ja: "展覧会",
          name_en: "Exhibition",
        }),
      ],
      relationships: [rel("r1", "HAS", "incoming-art", "incoming-exhibition")],
    };

    const result = await fuseGraphs({
      sourceGraph,
      targetGraph,
      labelCheck: false,
    });

    // アートプロジェクトが重複せず、既存 + 新規(展覧会) の 2 ノードになる
    expect(result.nodes).toHaveLength(2);
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("ART PROJECT"); // 既存ノードはそのまま残る
    expect(names).toContain("展覧会");
    expect(names).not.toContain("アートプロジェクト"); // 日本語生 name の重複は作られない

    // 抽出側 アートプロジェクト は既存ノード id にマップされる
    const record = result.nodeIdRecords.find(
      (r) => r.prevId === "incoming-art",
    );
    expect(record?.newId).toBe("existing-art");

    // エッジは既存ノード → 新規(展覧会) を指す
    expect(result.relationships).toHaveLength(1);
    const exhibitionNode = result.nodes.find((n) => n.name === "展覧会");
    expect(result.relationships[0]?.fromNodeId).toBe("existing-art");
    expect(result.relationships[0]?.toNodeId).toBe(exhibitionNode?.id);
  });

  it("still merges by name when labelCheck is false regardless of label", async () => {
    const sourceGraph = {
      nodes: [node("s1", "ART PROJECT", "Concept", { name_ja: "アートプロジェクト" })],
      relationships: [],
    };
    const targetGraph = {
      nodes: [node("t1", "アートプロジェクト", "Activity", { name_en: "ART PROJECT" })],
      relationships: [],
    };

    const result = await fuseGraphs({
      sourceGraph,
      targetGraph,
      labelCheck: false,
    });
    expect(result.nodes).toHaveLength(1);
  });

  it("keeps nodes separate when labelCheck is true and labels differ", async () => {
    const sourceGraph = {
      nodes: [node("s1", "ART PROJECT", "Concept", { name_ja: "アートプロジェクト" })],
      relationships: [],
    };
    const targetGraph = {
      nodes: [node("t1", "アートプロジェクト", "Activity", { name_en: "ART PROJECT" })],
      relationships: [],
    };

    const result = await fuseGraphs({
      sourceGraph,
      targetGraph,
      labelCheck: true,
    });
    expect(result.nodes).toHaveLength(2);
  });

  it("adds genuinely new nodes", async () => {
    const sourceGraph = {
      nodes: [node("s1", "ART PROJECT", "Concept")],
      relationships: [],
    };
    const targetGraph = {
      nodes: [node("t1", "MUSEUM", "Place", { name_ja: "美術館" })],
      relationships: [],
    };

    const result = await fuseGraphs({
      sourceGraph,
      targetGraph,
      labelCheck: false,
    });
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map((n) => n.name)).toEqual(
      expect.arrayContaining(["ART PROJECT", "MUSEUM"]),
    );
  });
});

describe("dataDisambiguation (simpleMerge)", () => {
  it("dedupes language variants inside a single graph", () => {
    const graph = {
      nodes: [
        node("a", "ART PROJECT", "Concept", {
          name_ja: "アートプロジェクト",
          name_en: "ART PROJECT",
        }),
        node("b", "アートプロジェクト", "Concept", {
          name_ja: "アートプロジェクト",
          name_en: "ART PROJECT",
        }),
        node("c", "MUSEUM", "Place"),
      ],
      relationships: [rel("r1", "AT", "b", "c")],
    };

    const result = dataDisambiguation(graph);
    expect(result.nodes).toHaveLength(2);
    // 重複していた b は a に統合され、エッジの端点が a に付け替わる
    const rel1 = result.relationships[0];
    expect(rel1?.fromNodeId).toBe("a");
    expect(rel1?.toNodeId).toBe("c");
  });
});
