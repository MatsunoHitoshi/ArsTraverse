# KG Alignment Agent — 仕様

## 1. 目的

TopicSpace 知識グラフの品質を改善する。第1版では次を対象とする。

- 重複ノードの統合（完全一致および fuzzy）
- ラベル・表記の統一
- 重複エッジ `(sourceId, targetId, type)` の整理

## 2. 非スコープ

- 本番グラフ（TopicSpace）への直接書き込み
- 変更提案の自動承認・マージ
- エンドユーザ向け Web UI

## 3. 前提

- `npm run dev` でアプリが起動していること
- 実行ユーザーが対象 TopicSpace の管理者または提案作成者であること
- 書き込み操作には有効な NextAuth セッション Cookie が必要

## 4. 処理方針

- **オーケストレータ主導** — スキャン・MCP 呼び出し・ログは決定的
- **LLM は計画生成のみ** — `AlignmentPlan` を structured output で生成
- **1 実行 = 1 変更提案ドラフト**
- 反映は **提出（`PENDING`）まで**。マージは [`/proposals/[proposal_id]`](../../src/app/proposals/[proposal_id]/page.tsx) の既存 UI

## 5. 正規化カテゴリ（checkpoint A）

| ID | 説明 |
|----|------|
| `exact_duplicates` | name（+ label）完全一致グループの統合 |
| `fuzzy_duplicates` | embedding / 文字列類似による候補（要 `User-Authorization` 推奨） |
| `label_normalization` | ノード `label`（種別）の統一 |
| `edge_dedup` | 重複エッジの削除 |

## 6. 人間確認ポイント

### checkpoint A

実行するカテゴリを checkbox で選択（複数可）。

### checkpoint B

- 各マージ案を confirm（`confidence: low` はデフォルト off）
- 統合後の `name` / `label` を入力で上書き可能
- ラベル変更・エッジ整理も個別 confirm

### checkpoint C

`get_graph_edit_proposal_diff` のサマリを表示し、提出可否を confirm（デフォルト: 提出しない）。

## 7. AlignmentPlan スキーマ

```ts
{
  merges: [{
    groupKey, canonicalNodeId, duplicateNodeIds[],
    canonicalName?, canonicalLabel?,
    rationale, confidence: "high" | "medium" | "low"
  }],
  labelNormalizations: [{ nodeId, name, label, rationale }],
  edgeDedup: [{ edgeIds[], keepEdgeId, rationale? }]
}
```

## 8. ログ仕様

ディレクトリ: `.alignment-runs/{topicSpaceId}/{runId}/`

| ファイル | 内容 |
|----------|------|
| `events.jsonl` | 構造化イベント（1 行 1 JSON） |
| `plan.json` | checkpoint B 後の確定プラン |
| `summary.md` | 人間向けサマリ |

`--resume <runId>` は `plan.json` を読み、execute フェーズから再開する。

## 9. CLI フラグ

| フラグ | 説明 |
|--------|------|
| `--topic-space-id` | 必須 |
| `--base-url` | API ベース URL |
| `--dry-run` | スキャン + checkpoint A のみ |
| `--with-context` | 低コスト文脈取得（MCP contextual description） |
| `--resume <runId>` | 実行再開 |
| `--model <name>` | OpenAI モデル上書き |
| `--no-submit` | ドラフト適用後に提出しない |

## 10. LLM モデル

| 用途 | モデル |
|------|--------|
| AlignmentPlan 生成 | **`gpt-4o-mini`**（デフォルト） |
| `--with-context` 時の MCP 文脈 | `gpt-4.1-nano`（サーバー側既存） |
| オーケストレータ | なし |

環境変数 `ALIGNMENT_AGENT_MODEL` または `--model` で上書き可能。

## 11. MCP ツール依存（`{id}` = `mcpToolIdentifier` または `ts_{topicSpaceId}`）

| フェーズ | ツール |
|----------|--------|
| scan | `find_exact_duplicate_node_groups_in_{id}`, `get_label_distribution_in_{id}`, `find_duplicate_edges_in_{id}` |
| plan (optional) | `get_contextual_description_from_{id}` |
| execute | `create_graph_edit_proposal_draft_in_{id}`, `merge_nodes_in_draft_in_{id}`, `upsert_node_in_{id}`, `deduplicate_edges_in_draft_in_{id}` |
| review/submit | `get_graph_edit_proposal_diff_in_{id}`, `submit_graph_edit_proposal_in_{id}` |

## 12. 制限・注意

- embedding 検索には `ALIGNMENT_AGENT_USER_AUTH_TOKEN`（`User-Authorization`）推奨
- 大規模グラフでは `list_topic_space_graph` のページングに注意
- LLM コスト: 1 run あたり plan 生成 1 回 + 任意で文脈 MCP 数回
