import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  AlignmentPlanSchema,
  type AlignmentPlan,
  type NormalizationCategory,
  type ScanResult,
} from "./types.js";

export async function generateAlignmentPlan(params: {
  model: string;
  scan: ScanResult;
  categories: NormalizationCategory[];
  contextSnippets?: string[];
}): Promise<AlignmentPlan> {
  const llm = new ChatOpenAI({
    model: params.model,
    temperature: 0.2,
  }).withStructuredOutput(AlignmentPlanSchema);

  const system = `あなたは知識グラフのアライメント担当です。
スキャン結果に基づき、重複ノード統合・ラベル統一・重複エッジ整理の計画を JSON で出力してください。
- confidence=low は人間がスキップしやすい曖昧な提案に使う
- canonicalNodeId は必ずグループ内の既存ノード ID から選ぶ
- duplicateNodeIds には canonical を含めない
- 選択されたカテゴリ以外の提案は空配列にする`;

  const user = JSON.stringify(
    {
      categories: params.categories,
      scan: params.scan,
      contextSnippets: params.contextSnippets ?? [],
    },
    null,
    2,
  );

  const plan = await llm.invoke([
    new SystemMessage(system),
    new HumanMessage(user),
  ]);

  return plan;
}
