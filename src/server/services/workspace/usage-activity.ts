import type { WorkspaceGraphEvent } from "./workspace-graph-history";

export type GraphAdditionCounts = {
  manual: number;
  sketch: number;
  promoted: number;
  llm: number;
  unknown: number;
};

export type WritingActivityPoint = GraphAdditionCounts & {
  at: string;
  slug: string;
  title: string;
  textAdded: number;
};

const EMPTY_COUNTS: GraphAdditionCounts = {
  manual: 0,
  sketch: 0,
  promoted: 0,
  llm: 0,
  unknown: 0,
};

/** ノード・エッジの追加と、下書きが本文根拠付きになった件数。更新や削除は含めない。 */
export function countGraphAdditions(
  events: WorkspaceGraphEvent[],
): GraphAdditionCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const event of events) {
    if (event.change === "promoted") {
      counts.promoted += 1;
      continue;
    }
    if (event.change !== "added") continue;
    if (
      event.origin === "manual" ||
      event.origin === "sketch" ||
      event.origin === "llm"
    ) {
      counts[event.origin] += 1;
    } else {
      counts.unknown += 1;
    }
  }
  return counts;
}

export function textAddedLength(previous: string, current: string): number {
  return Math.max(0, current.length - previous.length);
}

export function hasActivity(
  counts: GraphAdditionCounts,
  textAdded: number,
): boolean {
  return (
    textAdded > 0 ||
    counts.manual > 0 ||
    counts.sketch > 0 ||
    counts.promoted > 0 ||
    counts.llm > 0 ||
    counts.unknown > 0
  );
}
