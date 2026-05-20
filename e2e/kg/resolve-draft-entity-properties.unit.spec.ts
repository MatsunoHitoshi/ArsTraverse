import { test, expect } from "@playwright/test";
import { resolveDraftEntityProperties } from "@/server/services/graph-edit-proposal/resolve-draft-entity-properties";

test.describe("resolveDraftEntityProperties", () => {
  test("keeps existing properties when input is undefined", () => {
    expect(
      resolveDraftEntityProperties({ genre: "fiction", year: "2020" }, undefined),
    ).toEqual({ genre: "fiction", year: "2020" });
  });

  test("returns empty object for new entity when input is undefined", () => {
    expect(resolveDraftEntityProperties(undefined, undefined)).toEqual({});
  });

  test("clears properties when input is an explicit empty object", () => {
    expect(resolveDraftEntityProperties({ genre: "fiction" }, {})).toEqual({});
  });

  test("normalizes provided property values to strings", () => {
    expect(
      resolveDraftEntityProperties(undefined, {
        count: 3,
        active: true,
        note: null,
      }),
    ).toEqual({ count: "3", active: "true", note: "null" });
  });
});
