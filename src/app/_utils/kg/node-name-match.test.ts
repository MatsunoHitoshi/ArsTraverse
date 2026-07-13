import { describe, expect, it } from "vitest";
import {
  getNodeNameCandidates,
  getNodeNameKeys,
  nodeMatchesName,
  nodesShareName,
  normalizeNameKey,
} from "./node-name-match";

describe("normalizeNameKey", () => {
  it("applies NFKC, trim and lowercase", () => {
    // 全角英字 → 半角、前後空白除去、小文字化
    expect(normalizeNameKey("  ＡＲＴ Project  ")).toBe("art project");
  });

  it("treats width/case variants as equal", () => {
    expect(normalizeNameKey("ART PROJECT")).toBe(normalizeNameKey("art project"));
  });
});

describe("getNodeNameCandidates", () => {
  it("collects name, name_ja and name_en, removing duplicates/empties", () => {
    const node = {
      name: "ART PROJECT",
      properties: { name_ja: "アートプロジェクト", name_en: "ART PROJECT" },
    };
    expect(getNodeNameCandidates(node).sort()).toEqual(
      ["ART PROJECT", "アートプロジェクト"].sort(),
    );
  });

  it("handles missing/undefined properties", () => {
    expect(getNodeNameCandidates({ name: "Solo" })).toEqual(["Solo"]);
    expect(getNodeNameCandidates({ name: "Solo", properties: undefined })).toEqual(
      ["Solo"],
    );
  });

  it("ignores non-string and blank property values", () => {
    const node = {
      name: "Solo",
      properties: { name_ja: "   ", name_en: 123 as unknown },
    };
    expect(getNodeNameCandidates(node)).toEqual(["Solo"]);
  });
});

describe("getNodeNameKeys", () => {
  it("produces normalized keys for every candidate", () => {
    const keys = getNodeNameKeys({
      name: "ART PROJECT",
      properties: { name_ja: "アートプロジェクト", name_en: "art project" },
    });
    expect(keys.has("art project")).toBe(true);
    expect(keys.has("アートプロジェクト")).toBe(true);
    // 大文字/小文字違いは同一キーに畳まれる
    expect(keys.size).toBe(2);
  });
});

describe("nodesShareName", () => {
  it("matches nodes across language variants (the duplication bug)", () => {
    // 既存ノード: 生 name が英語
    const existing = {
      name: "ART PROJECT",
      properties: { name_ja: "アートプロジェクト", name_en: "ART PROJECT" },
    };
    // 新規抽出ノード: 生 name が日本語
    const extracted = {
      name: "アートプロジェクト",
      properties: { name_ja: "アートプロジェクト", name_en: "ART PROJECT" },
    };
    expect(nodesShareName(existing, extracted)).toBe(true);
  });

  it("matches when only one localized field overlaps", () => {
    const a = { name: "Beuys", properties: { name_ja: "ボイス" } };
    const b = { name: "ボイス", properties: {} };
    expect(nodesShareName(a, b)).toBe(true);
  });

  it("returns false for genuinely different nodes", () => {
    const a = {
      name: "ART PROJECT",
      properties: { name_ja: "アートプロジェクト" },
    };
    const b = { name: "MUSEUM", properties: { name_ja: "美術館" } };
    expect(nodesShareName(a, b)).toBe(false);
  });

  it("falls back to raw name comparison when no localized props exist", () => {
    expect(nodesShareName({ name: "Foo" }, { name: "foo" })).toBe(true);
    expect(nodesShareName({ name: "Foo" }, { name: "Bar" })).toBe(false);
  });
});

describe("nodeMatchesName", () => {
  const node = {
    name: "ART PROJECT",
    properties: { name_ja: "アートプロジェクト", name_en: "ART PROJECT" },
  };

  it("matches against any name variant", () => {
    expect(nodeMatchesName(node, "アートプロジェクト")).toBe(true);
    expect(nodeMatchesName(node, "art project")).toBe(true);
    expect(nodeMatchesName(node, "ART PROJECT")).toBe(true);
  });

  it("returns false for empty or non-matching names", () => {
    expect(nodeMatchesName(node, "")).toBe(false);
    expect(nodeMatchesName(node, "   ")).toBe(false);
    expect(nodeMatchesName(node, "美術館")).toBe(false);
  });
});
