import { describe, expect, it } from "vitest";
import {
  buildLocalContextFromNodes,
  filterNodesForChunk,
} from "./build-local-context";
import type { NodeTypeForFrontend } from "@/app/const/types";

function node(
  name: string,
  label: string,
  props: Record<string, string> = {},
): NodeTypeForFrontend {
  return { id: name, name, label, properties: props };
}

describe("buildLocalContextFromNodes", () => {
  const nodes = [
    node("Joseph Beuys", "Person", { name_ja: "ヨーゼフ・ボイス", name_en: "Joseph Beuys" }),
    node("Documentary Film", "Concept"),
    node("Unrelated Entity", "Organization"),
  ];

  it("filters nodes that appear in chunk text by name", () => {
    const chunk = "Joseph Beuys was a German artist.";
    expect(filterNodesForChunk(chunk, nodes).map((n) => n.name)).toEqual([
      "Joseph Beuys",
    ]);
  });

  it("filters nodes that appear by Japanese name", () => {
    const chunk = "ヨーゼフ・ボイスに関する記述";
    expect(filterNodesForChunk(chunk, nodes).map((n) => n.name)).toEqual([
      "Joseph Beuys",
    ]);
  });

  it("builds context string only for matching nodes", () => {
    const chunk = "Documentary Film is discussed here.";
    expect(buildLocalContextFromNodes(chunk, nodes)).toBe(
      "- Documentary Film [Concept] ",
    );
  });
});
