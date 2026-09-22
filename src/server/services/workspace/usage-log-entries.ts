import {
  classifyGraphEvents,
  type WorkspaceGraphEvent,
} from "./workspace-graph-history";
import { tiptapPlainText } from "./writing-history";

export const UNRECORDED_INTERVAL_DESCRIPTION =
  "履歴の間隔に残っていた変更です";
export const CURRENT_SAVE_DESCRIPTION =
  "いまの保存にあって、直前の履歴に無い変更です";
export const UNRECORDED_WORKSPACE_HISTORY_ID = "unrecorded:workspace";

export type UsageLogActor = {
  id: string;
  name: string | null;
  image: string | null;
};

export type UsageLogHistorySnapshot = {
  id: string;
  workspaceId: string;
  changeDescription: string | null;
  previousContent: unknown;
  currentContent: unknown;
  previousGraph: unknown;
  currentGraph: unknown;
  createdAt: Date;
  changedBy: UsageLogActor;
};

export type UsageLogEntry = {
  id: string;
  workspaceId: string;
  changeDescription: string | null;
  previousText: string;
  currentText: string;
  graphEvents: WorkspaceGraphEvent[];
  createdAt: Date;
  changedBy: UsageLogActor;
};

const UNATTRIBUTED_ACTOR: UsageLogActor = {
  id: "unrecorded",
  name: null,
  image: null,
};

export function parseUnrecordedHistoryId(
  historyId: string,
):
  | { kind: "workspace" }
  | { kind: "interval"; olderId: string; newerId: string }
  | null {
  if (historyId === UNRECORDED_WORKSPACE_HISTORY_ID) {
    return { kind: "workspace" };
  }
  const prefix = "unrecorded:";
  if (!historyId.startsWith(prefix)) return null;
  const rest = historyId.slice(prefix.length);
  const splitAt = rest.indexOf(":");
  if (splitAt <= 0 || splitAt === rest.length - 1) return null;
  return {
    kind: "interval",
    olderId: rest.slice(0, splitAt),
    newerId: rest.slice(splitAt + 1),
  };
}

function textsDiffer(previous: unknown, current: unknown): boolean {
  return tiptapPlainText(previous) !== tiptapPlainText(current);
}

function gapEntry(input: {
  id: string;
  workspaceId: string;
  description: string;
  previousContent: unknown;
  currentContent: unknown;
  previousGraph: unknown;
  currentGraph: unknown;
  createdAt: Date;
  changedBy: UsageLogActor;
}): UsageLogEntry | null {
  const graphEvents = classifyGraphEvents(
    input.previousGraph,
    input.currentGraph,
  );
  if (
    !textsDiffer(input.previousContent, input.currentContent) &&
    graphEvents.length === 0
  ) {
    return null;
  }
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    changeDescription: input.description,
    previousText: tiptapPlainText(input.previousContent),
    currentText: tiptapPlainText(input.currentContent),
    graphEvents,
    createdAt: input.createdAt,
    changedBy: input.changedBy,
  };
}

function recordedEntry(history: UsageLogHistorySnapshot): UsageLogEntry {
  return {
    id: history.id,
    workspaceId: history.workspaceId,
    changeDescription: history.changeDescription,
    previousText: tiptapPlainText(history.previousContent),
    currentText: tiptapPlainText(history.currentContent),
    graphEvents: classifyGraphEvents(
      history.previousGraph,
      history.currentGraph,
    ),
    createdAt: history.createdAt,
    changedBy: history.changedBy,
  };
}

/**
 * 保存済みの履歴行に、行と行のあいだ、および最後の履歴から現在の保存までの
 * 差分を足す。配列は新しい順。
 */
export function expandUsageLogEntries(input: {
  histories: UsageLogHistorySnapshot[];
  workspace?: {
    workspaceId: string;
    content: unknown;
    graph: unknown;
    updatedAt: Date;
  } | null;
}): UsageLogEntry[] {
  const chronological = [...input.histories].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  const ordered: UsageLogEntry[] = [];
  for (let index = 0; index < chronological.length; index += 1) {
    const history = chronological[index]!;
    const older = chronological[index - 1];
    if (older) {
      const gap = gapEntry({
        id: `unrecorded:${older.id}:${history.id}`,
        workspaceId: history.workspaceId,
        description: UNRECORDED_INTERVAL_DESCRIPTION,
        previousContent: older.currentContent,
        currentContent: history.previousContent,
        previousGraph: older.currentGraph,
        currentGraph: history.previousGraph,
        createdAt: new Date(history.createdAt.getTime() - 1),
        changedBy: history.changedBy,
      });
      if (gap) ordered.push(gap);
    }
    ordered.push(recordedEntry(history));
  }

  const newest = chronological[chronological.length - 1];
  const workspace = input.workspace;
  if (workspace) {
    const previousContent = newest?.currentContent ?? null;
    const previousGraph = newest?.currentGraph ?? null;
    const createdAt =
      newest && workspace.updatedAt.getTime() <= newest.createdAt.getTime()
        ? new Date(newest.createdAt.getTime() + 1)
        : workspace.updatedAt;
    const currentSave = gapEntry({
      id: UNRECORDED_WORKSPACE_HISTORY_ID,
      workspaceId: workspace.workspaceId,
      description: CURRENT_SAVE_DESCRIPTION,
      previousContent,
      currentContent: workspace.content,
      previousGraph,
      currentGraph: workspace.graph,
      createdAt,
      changedBy: UNATTRIBUTED_ACTOR,
    });
    if (currentSave) ordered.push(currentSave);
  }

  return ordered.reverse();
}
