import { describe, expect, it } from "vitest";
import {
  buildLocalContextFromNodes,
  filterNodesForChunk,
  termAppearsInChunk,
} from "./build-local-context";
import type { NodeTypeForFrontend } from "@/app/const/types";

function node(
  name: string,
  label: string,
  props: Record<string, string> = {},
): NodeTypeForFrontend {
  return { id: name, name, label, properties: props };
}

describe("termAppearsInChunk", () => {
  it("matches ASCII terms with word boundaries (case insensitive)", () => {
    expect(termAppearsInChunk("Joseph Beuys", "joseph beuys was here")).toBe(
      true,
    );
    expect(termAppearsInChunk("Joseph Beuys", "JOSEPH BEUYS")).toBe(true);
  });

  it("does not match ASCII terms as substrings of other words", () => {
    expect(termAppearsInChunk("AI", "email and detail")).toBe(false);
    expect(termAppearsInChunk("Art", "particular focus")).toBe(false);
    expect(termAppearsInChunk("He", "the museum here")).toBe(false);
  });

  it("matches short ASCII terms when they are standalone words", () => {
    expect(termAppearsInChunk("AI", "Advances in AI research")).toBe(true);
  });

  it("matches Japanese terms by substring", () => {
    expect(termAppearsInChunk("ヨーゼフ・ボイス", "ヨーゼフ・ボイスに関する記述")).toBe(
      true,
    );
    expect(termAppearsInChunk("アート", "日本型アートプロジェクト")).toBe(true);
  });

  it("does not false-match Japanese terms across unrelated text", () => {
    expect(termAppearsInChunk("美術", "生物学の研究")).toBe(false);
  });
});

describe("buildLocalContextFromNodes", () => {
  const nodes = [
    node("Joseph Beuys", "Person", {
      name_ja: "ヨーゼフ・ボイス",
      name_en: "Joseph Beuys",
    }),
    node("AI", "Concept"),
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

  it("excludes nodes that would false-match inside other English words", () => {
    const chunk = "Please email the curator about the exhibition claim.";
    expect(filterNodesForChunk(chunk, nodes).map((n) => n.name)).toEqual([]);
  });

  it("builds context string only for matching nodes", () => {
    const chunk = "Documentary Film is discussed here.";
    expect(buildLocalContextFromNodes(chunk, nodes)).toBe(
      "- Documentary Film [Concept] ",
    );
  });
});
