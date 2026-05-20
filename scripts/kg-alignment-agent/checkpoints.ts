import { checkbox, confirm, input, select } from "@inquirer/prompts";
import type {
  AlignmentPlan,
  ConfirmedPlan,
  NormalizationCategory,
} from "./types.js";

export async function checkpointCategories(): Promise<NormalizationCategory[]> {
  return checkbox({
    message: "実行する正規化カテゴリを選択してください",
    choices: [
      {
        name: "完全一致ノード統合",
        value: "exact_duplicates" as const,
        checked: true,
      },
      {
        name: "fuzzy 重複ノード統合（要 embedding トークン推奨）",
        value: "fuzzy_duplicates" as const,
        checked: false,
      },
      {
        name: "ラベル・表記統一",
        value: "label_normalization" as const,
        checked: true,
      },
      {
        name: "重複エッジ整理",
        value: "edge_dedup" as const,
        checked: true,
      },
    ],
  });
}

export async function checkpointReviewPlan(
  plan: AlignmentPlan,
): Promise<ConfirmedPlan> {
  const selectedMergeGroupKeys: string[] = [];
  const skippedMergeGroupKeys: string[] = [];

  const filteredMerges = [];

  for (const merge of plan.merges) {
    const defaultSelected = merge.confidence !== "low";
    const proceed = await confirm({
      message: `[${merge.confidence}] ${merge.groupKey}: ${merge.rationale}\n  canonical=${merge.canonicalNodeId}, duplicates=${merge.duplicateNodeIds.join(", ")}`,
      default: defaultSelected,
    });

    if (!proceed) {
      skippedMergeGroupKeys.push(merge.groupKey);
      continue;
    }

    const canonicalName = await input({
      message: "統合後のノード名 (Enter で LLM 提案を維持)",
      default: merge.canonicalName ?? "",
    });

    const canonicalLabel = await input({
      message: "統合後のラベル (Enter で LLM 提案を維持)",
      default: merge.canonicalLabel ?? "",
    });

    filteredMerges.push({
      ...merge,
      ...(canonicalName.trim() ? { canonicalName: canonicalName.trim() } : {}),
      ...(canonicalLabel.trim()
        ? { canonicalLabel: canonicalLabel.trim() }
        : {}),
    });
    selectedMergeGroupKeys.push(merge.groupKey);
  }

  const labelNormalizations = [];
  for (const norm of plan.labelNormalizations) {
    const apply = await confirm({
      message: `ラベル変更: node ${norm.nodeId} → "${norm.label}" (${norm.rationale})`,
      default: true,
    });
    if (apply) labelNormalizations.push(norm);
  }

  const edgeDedup = [];
  for (const group of plan.edgeDedup) {
    const apply = await confirm({
      message: `エッジ整理: keep ${group.keepEdgeId}, remove ${group.edgeIds.filter((id) => id !== group.keepEdgeId).join(", ")}`,
      default: true,
    });
    if (apply) edgeDedup.push(group);
  }

  return {
    merges: filteredMerges,
    labelNormalizations,
    edgeDedup,
    selectedMergeGroupKeys,
    skippedMergeGroupKeys,
  };
}

export async function checkpointSubmitDiff(
  diffSummary: string,
): Promise<boolean> {
  console.log("\n--- 変更提案 diff サマリ ---\n");
  console.log(diffSummary);
  return confirm({
    message: "この内容で変更提案を提出（PENDING）しますか？",
    default: false,
  });
}

export async function checkpointSelectCanonicalNode(
  groupKey: string,
  nodes: Array<{ id: string; name: string; label: string }>,
): Promise<string> {
  return select({
    message: `${groupKey}: 残す正規ノード (canonical) を選択`,
    choices: nodes.map((n) => ({
      name: `${n.name} [${n.label}] (${n.id})`,
      value: n.id,
    })),
  });
}
