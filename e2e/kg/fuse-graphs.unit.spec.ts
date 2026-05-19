import { createId } from "@paralleldrive/cuid2";
import { test, expect } from "@playwright/test";
import { fuseGraphs } from "@/app/_utils/kg/data-disambiguation";
import { makeGraphNode, makeGraphRelationship } from "../helpers/graph-fixtures";

test.describe("fuseGraphs", () => {
  test("同名ノード統合後に (from, to, type) が重複するエッジを除去する", async () => {
    const sharedNodeId = createId();
    const targetOnlyNodeId = createId();

    const sourceGraph = {
      nodes: [
        makeGraphNode({
          id: sharedNodeId,
          name: "東京国立博物館",
          label: "Organization",
        }),
      ],
      relationships: [],
    };

    const targetGraph = {
      nodes: [
        makeGraphNode({
          id: createId(),
          name: "東京国立博物館",
          label: "Organization",
        }),
        makeGraphNode({
          id: targetOnlyNodeId,
          name: "上野公園",
          label: "Place",
        }),
      ],
      relationships: [
        makeGraphRelationship({
          id: createId(),
          fromNodeId: createId(),
          toNodeId: targetOnlyNodeId,
          type: "LOCATED_IN",
        }),
        makeGraphRelationship({
          id: createId(),
          fromNodeId: createId(),
          toNodeId: targetOnlyNodeId,
          type: "LOCATED_IN",
        }),
      ],
    };

    // target の重複ノード ID をエッジ端点に使う（マージ後は sharedNodeId に寄る）
    const duplicateSourceId = targetGraph.nodes[0]!.id;
    targetGraph.relationships = [
      makeGraphRelationship({
        id: createId(),
        fromNodeId: duplicateSourceId,
        toNodeId: targetOnlyNodeId,
        type: "LOCATED_IN",
      }),
      makeGraphRelationship({
        id: createId(),
        fromNodeId: duplicateSourceId,
        toNodeId: targetOnlyNodeId,
        type: "LOCATED_IN",
      }),
    ];

    const result = await fuseGraphs({
      sourceGraph,
      targetGraph,
      labelCheck: true,
    });

    expect(result.nodes).toHaveLength(2);

    const mergedPlaceNode = result.nodes.find((n) => n.name === "上野公園");
    expect(mergedPlaceNode).toBeDefined();

    const locatedInEdges = result.relationships.filter(
      (r) =>
        r.type === "LOCATED_IN" &&
        r.fromNodeId === sharedNodeId &&
        r.toNodeId === mergedPlaceNode!.id,
    );
    expect(locatedInEdges).toHaveLength(1);
  });
});
