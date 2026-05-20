import { test, expect } from "@playwright/test";
import { findDuplicateEdgeGroups } from "@/app/_utils/kg/find-duplicate-edge-groups";

test.describe("findDuplicateEdgeGroups", () => {
  test("groups edges with same source, target, and type", () => {
    const groups = findDuplicateEdgeGroups([
      { id: "e1", type: "RELATED_TO", sourceId: "a", targetId: "b" },
      { id: "e2", type: "RELATED_TO", sourceId: "a", targetId: "b" },
      { id: "e3", type: "PART_OF", sourceId: "a", targetId: "b" },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.edgeCount).toBe(2);
    expect(groups[0]?.edges.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });
});
