import { describe, expect, it } from "vitest";
import type { CustomNodeType } from "@/app/const/types";
import { findEntityMatches } from "./highlight-entities";

function entity(
  id: string,
  name: string,
  properties: Record<string, string> = {},
  label = "Concept",
): CustomNodeType {
  return { id, name, label, properties } as unknown as CustomNodeType;
}

describe("findEntityMatches", () => {
  it("highlights the localized name even when node.name is the other language", () => {
    // node.name は英語だが、本文は日本語 → name_ja でマッチできる
    const entities = [
      entity("1", "ART PROJECT", {
        name_ja: "アートプロジェクト",
        name_en: "ART PROJECT",
      }),
    ];
    const matches = findEntityMatches(
      "このアートプロジェクトは重要だ",
      entities,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.entityId).toBe("1");
    expect(matches[0]?.entityName).toBe("ART PROJECT");
  });

  it("still matches the raw name (case insensitive)", () => {
    const entities = [
      entity("1", "ART PROJECT", { name_ja: "アートプロジェクト" }),
    ];
    const matches = findEntityMatches("This art project matters", entities);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.entityId).toBe("1");
  });

  it("does not double-count overlapping candidates for the same entity", () => {
    // name と name_en が同一表記。重複マッチを作らない
    const entities = [
      entity("1", "ART PROJECT", {
        name_ja: "アートプロジェクト",
        name_en: "ART PROJECT",
      }),
    ];
    const matches = findEntityMatches("An ART PROJECT here", entities);
    expect(matches).toHaveLength(1);
  });

  it("returns no match when neither variant appears", () => {
    const entities = [entity("1", "MUSEUM", { name_ja: "美術館" })];
    expect(findEntityMatches("アートプロジェクトの話", entities)).toHaveLength(0);
  });
});
