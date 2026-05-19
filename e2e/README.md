# E2E / 統合テスト（Playwright）

KG データ整合性修正のサーバー側ロジックを検証するテストです。

## セットアップ

```bash
npm install
# 初回のみ（ブラウザ E2E を追加する場合）
npx playwright install chromium
```

## 実行

```bash
# 全 KG テスト（unit + integration）
npm run test:e2e:kg

# すべての Playwright テスト
npm run test:e2e
```

## 前提

- ルートの `.env` に有効な `DATABASE_URL` が必要です（integration テスト用）。
- **DB に接続できない場合**（例: ローカル Supabase 未起動）、`*integration.spec.ts` は自動スキップされます。
- integration テスト実行前に DB を起動してください（例: Supabase ローカル `127.0.0.1:54322`）。

```bash
# Supabase ローカル DB を使う場合（プロジェクトの設定に合わせて調整）
npx supabase start
npm run test:e2e:kg
```

- integration テストは専用の Topic Space を作成・削除します（`pw-kg-test-*` プレフィックス）。

## テスト構成

| ファイル | 種別 | 検証内容 |
|----------|------|----------|
| `kg/fuse-graphs.unit.spec.ts` | unit | `fuseGraphs` のエッジ重複除去 |
| `kg/apply-graph-changes.integration.spec.ts` | integration | インシデントエッジ削除、topicSpaceId スコープ、端点スキップ、skipDuplicates |
| `kg/rollback-graph.integration.spec.ts` | integration | ADD/REMOVE ロールバック |
