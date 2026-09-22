import { describe, expect, it } from "vitest";
import { countGraphAdditions, textAddedLength } from "./usage-activity";
import type { WorkspaceGraphEvent } from "./workspace-graph-history";

function event(
  change: WorkspaceGraphEvent["change"],
  origin: WorkspaceGraphEvent["origin"],
): WorkspaceGraphEvent {
  return {
    kind: "node",
    change,
    origin,
    id: `${change}-${origin}`,
    name: "語",
  };
}

describe("countGraphAdditions", () => {
  it("counts additions and promotions, and skips updates and removals", () => {
    expect(
      countGraphAdditions([
        event("added", "manual"),
        event("added", "sketch"),
        event("added", "llm"),
        event("added", "unknown"),
        event("promoted", "sketch"),
        event("updated", "manual"),
        event("removed", "llm"),
      ]),
    ).toEqual({
      manual: 1,
      sketch: 1,
      promoted: 1,
      llm: 1,
      unknown: 1,
    });
  });
});

describe("textAddedLength", () => {
  it("counts characters gained and ignores shortening", () => {
    expect(textAddedLength("短い", "短い本文")).toBe(2);
    expect(textAddedLength("長い本文", "短い")).toBe(0);
    expect(textAddedLength("同じ", "同じ")).toBe(0);
  });
});
