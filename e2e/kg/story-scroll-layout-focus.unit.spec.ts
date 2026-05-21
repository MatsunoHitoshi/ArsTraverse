import { test, expect } from "@playwright/test";
import {
  getLayoutFocusEdgeIdsFromScrollSteps,
  resolveScrollStepGraphFocus,
  type ScrollStep,
} from "@/app/_utils/story-scroll-utils";
import { getEdgeCompositeKeyFromLink } from "@/app/const/story-segment";

const relationships = [
  { sourceId: "a", targetId: "b", type: "REL1" },
  { sourceId: "b", targetId: "c", type: "REL2" },
];

test.describe("story-scroll layout focus edges", () => {
  test("resolveScrollStepGraphFocus はコミュニティのみステップを展開する", () => {
    const step: ScrollStep = {
      id: "c1-0",
      communityId: "c1",
      text: "",
      nodeIds: [],
      edgeIds: [],
    };
    const communityMap = { a: "c1", b: "c1", c: "other" };
    const { nodeIds, edgeIds } = resolveScrollStepGraphFocus(
      step,
      relationships,
      communityMap,
    );
    expect(nodeIds).toEqual(["a", "b"]);
    expect(edgeIds).toContain(getEdgeCompositeKeyFromLink(relationships[0]!));
    expect(edgeIds).not.toContain(getEdgeCompositeKeyFromLink(relationships[1]!));
  });

  test("getLayoutFocusEdgeIdsFromScrollSteps は全セグメントのフォーカスエッジを union する", () => {
    const steps: ScrollStep[] = [
      {
        id: "s1",
        communityId: "c1",
        text: "",
        nodeIds: ["a", "b"],
        edgeIds: [],
      },
      {
        id: "s2",
        communityId: "c1",
        text: "",
        nodeIds: ["b", "c"],
        edgeIds: [],
      },
    ];
    const keys = getLayoutFocusEdgeIdsFromScrollSteps(steps, relationships);
    expect(keys).toContain(getEdgeCompositeKeyFromLink(relationships[0]!));
    expect(keys).toContain(getEdgeCompositeKeyFromLink(relationships[1]!));
  });

  test("__overview__ は layout union に含めない", () => {
    const steps: ScrollStep[] = [
      { id: "__overview__", communityId: "", text: "", nodeIds: [], edgeIds: [] },
      {
        id: "s1",
        communityId: "c1",
        text: "",
        nodeIds: ["a", "b"],
        edgeIds: [getEdgeCompositeKeyFromLink(relationships[0]!)],
      },
    ];
    const keys = getLayoutFocusEdgeIdsFromScrollSteps(steps, relationships);
    expect(keys).toEqual([getEdgeCompositeKeyFromLink(relationships[0]!)]);
  });
});
