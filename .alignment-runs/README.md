# KG Alignment — ローカル実行成果物

`npm run kg:align` の実行ごとに、Topic Space ID 配下に run ディレクトリが作成されます。

## ディレクトリ構成

```
.alignment-runs/
  README.md
  test-run-2026-05-19.md          # 手動テストの総合レポート（任意）
  {topicSpaceId}/
    {runId}/
      events.jsonl                # 監査ログ
      plan.json                   # checkpoint B 後の確定プラン
      summary.md                  # 実行サマリ
```

## Git 管理

- **`{topicSpaceId}/{runId}/` 以下**は `.gitignore` 対象（実行ログ）
- ルートの `test-run-*.md` などドキュメントは必要に応じてコミット可能

## 関連ドキュメント

- [operations.md](../docs/kg-alignment-agent/operations.md)
- [spec.md](../docs/kg-alignment-agent/spec.md)
