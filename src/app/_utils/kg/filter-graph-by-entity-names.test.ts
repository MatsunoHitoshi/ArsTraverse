import { describe, expect, it } from "vitest";
import type {
  GraphDocumentForFrontend,
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { filterGraphByEntityNames } from "./filter-graph-by-entity-names";

function node(
  id: string,
  name: string,
  properties: Record<string, string> = {},
  label = "Concept",
): NodeTypeForFrontend {
  return { id, name, label, properties };
}

function rel(
  id: string,
  sourceId: string,
  targetId: string,
): RelationshipTypeForFrontend {
  return { id, type: "REL", properties: {}, sourceId, targetId };
}

describe("filterGraphByEntityNames", () => {
  const graph: GraphDocumentForFrontend = {
    nodes: [
      node("art", "ART PROJECT", {
        name_ja: "アートプロジェクト",
        name_en: "ART PROJECT",
      }),
      node("museum", "MUSEUM", { name_ja: "美術館" }),
      node("city", "CITY", { name_ja: "都市" }),
    ],
    relationships: [rel("r1", "art", "museum")],
  };

  it("matches nodes by localized name variant found in text", () => {
    // 本文からは日本語表記 "アートプロジェクト" が抽出される
    const result = filterGraphByEntityNames(graph, ["アートプロジェクト"]);
    const ids = result?.nodes.map((n) => n.id) ?? [];
    // art 本体 + 隣接する museum が含まれる
    expect(ids).toContain("art");
    expect(ids).toContain("museum");
    expect(ids).not.toContain("city");
  });

  it("matches the raw english name too (case insensitive)", () => {
    const result = filterGraphByEntityNames(graph, ["art project"]);
    expect(result?.nodes.map((n) => n.id)).toContain("art");
  });

  it("returns undefined for null graph", () => {
    expect(filterGraphByEntityNames(null, ["art"])).toBeUndefined();
  });
});
