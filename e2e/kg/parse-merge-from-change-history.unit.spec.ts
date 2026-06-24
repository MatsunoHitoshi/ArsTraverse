import { test, expect } from "@playwright/test";
import {
  GraphChangeEntityType,
  GraphChangeType,
} from "@prisma/client";
import { parseNodeMergeFromChangeHistory } from "@/server/domain/kg/parse-merge-from-change-history";

test.describe("parseNodeMergeFromChangeHistory", () => {
  test("手動統合履歴から代表ノードと統合対象を復元する", () => {
    const canonicalId = "canonical-node";
    const removedId = "removed-node";

    const parsed = parseNodeMergeFromChangeHistory({
      id: "history-1",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      description: "ノードを統合しました",
      nodeLinkChangeHistories: [
        {
          changeType: GraphChangeType.REMOVE,
          changeEntityType: GraphChangeEntityType.NODE,
          previousState: {
            id: removedId,
            name: "フクダイ",
            label: "Person",
          },
          nextState: {},
        },
        {
          changeType: GraphChangeType.UPDATE,
          changeEntityType: GraphChangeEntityType.EDGE,
          previousState: {
            sourceId: removedId,
            targetId: "other-node",
          },
          nextState: {
            sourceId: canonicalId,
            targetId: "other-node",
          },
        },
      ],
    });

    expect(parsed).toEqual({
      changeHistoryId: "history-1",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      description: "ノードを統合しました",
      canonicalOldNodeId: canonicalId,
      removedNodeSnapshots: [
        {
          oldId: removedId,
          name: "フクダイ",
          label: "Person",
        },
      ],
    });
  });

  test("統合以外の履歴は null を返す", () => {
    const parsed = parseNodeMergeFromChangeHistory({
      id: "history-2",
      createdAt: new Date(),
      description: "ドキュメントを追加しました",
      nodeLinkChangeHistories: [],
    });

    expect(parsed).toBeNull();
  });
});
