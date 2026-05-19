import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import {
  buildRelationshipCreateRowsFromIdMap,
  mapFrontendGraphToPrismaGraph,
  mapFrontendRelationshipToPrisma,
} from "@/server/domain/kg/graph-format";

test.describe("graph-format", () => {
  test("mapFrontendRelationshipToPrisma は sourceId/targetId を fromNodeId/toNodeId に変換する", () => {
    const rel = mapFrontendRelationshipToPrisma({
      id: "rel-1",
      type: "LOCATED_IN",
      properties: { city: "Tokyo" },
      sourceId: "node-a",
      targetId: "node-b",
    });
    expect(rel.fromNodeId).toBe("node-a");
    expect(rel.toNodeId).toBe("node-b");
  });

  test("buildRelationshipCreateRowsFromIdMap は端点未解決のエッジをスキップする", () => {
    const oldToNew = new Map<string, string | undefined>([
      ["old-a", "new-a"],
      ["old-b", undefined],
    ]);
    const rows = buildRelationshipCreateRowsFromIdMap(
      [
        {
          type: "RELATED_TO",
          properties: {},
          fromNodeId: "old-a",
          toNodeId: "old-b",
        },
        {
          type: "RELATED_TO",
          properties: {},
          fromNodeId: "missing",
          toNodeId: "old-a",
        },
      ],
      oldToNew,
      "ts-1",
    );
    expect(rows).toHaveLength(0);
  });

  test("buildRelationshipCreateRowsFromIdMap は両端点が解決できれば行を生成する", () => {
    const oldToNew = new Map([
      ["old-a", "new-a"],
      ["old-b", "new-b"],
    ]);
    const rows = buildRelationshipCreateRowsFromIdMap(
      [
        {
          type: "RELATED_TO",
          properties: { note: "x" },
          fromNodeId: "old-a",
          toNodeId: "old-b",
        },
      ],
      oldToNew,
      "ts-1",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromNodeId: "new-a",
      toNodeId: "new-b",
      topicSpaceId: "ts-1",
    });
  });

  test("mapFrontendGraphToPrismaGraph はグラフ全体を Prisma 形式に変換する", () => {
    const nodeId = createId();
    const graph = mapFrontendGraphToPrismaGraph({
      nodes: [
        {
          id: nodeId,
          name: "Test",
          label: "Entity",
          properties: {},
        },
      ],
      relationships: [
        {
          id: createId(),
          type: "SELF",
          properties: {},
          sourceId: nodeId,
          targetId: nodeId,
        },
      ],
    });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.relationships[0]!.fromNodeId).toBe(nodeId);
    expect(graph.relationships[0]!.toNodeId).toBe(nodeId);
  });
});
