# KG Alignment Agent

TopicSpace の知識グラフを、既存 MCP エンドポイント経由で調査・正規化し、**変更提案（GraphEditProposal）** として提出する開発用 CLI エージェントです。

## ドキュメント

| 文書 | 内容 |
|------|------|
| [spec.md](./spec.md) | 仕様（スコープ、checkpoint、AlignmentPlan、LLM モデル） |
| [operations.md](./operations.md) | セットアップと実行手順 |
| [architecture.md](./architecture.md) | アーキテクチャと MCP 連携 |
| [test-run-2026-05-19.md](../../.alignment-runs/test-run-2026-05-19.md) | テスト実行レポート（動作途中・結果・提案レビュー） |

## クイックスタート

```bash
npm run dev

export ALIGNMENT_AGENT_SESSION_COOKIE='next-auth.session-token=...'

npm run kg:align -- --topic-space-id=<TopicSpace ID> --dry-run
```

実装コード: [`scripts/kg-alignment-agent/`](../../scripts/kg-alignment-agent/)
