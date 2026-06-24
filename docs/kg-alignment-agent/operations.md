# KG Alignment Agent — 運用手順

## 1. 事前準備

- [ ] Node.js 24.x（`.nvmrc`）と依存関係（`npm install`）
- [ ] `.env` に `OPENAI_API_KEY`, `DATABASE_URL` 等
- [ ] `npm run dev` で開発サーバー起動
- [ ] ブラウザでアプリにログインし、対象 TopicSpace の admin であること

## 2. 認証情報の取得

### MCP アクセストークン（推奨）

1. ブラウザで `/mcp/authorize?client=kg-alignment-agent&topic_space_id=YOUR_TOPIC_SPACE_ID` を開く
2. Google でログインし、対象 TopicSpace を選んでトークンを発行
3. 環境変数に設定:

```bash
export ALIGNMENT_AGENT_MCP_ACCESS_TOKEN='mcp1....'
```

### セッション Cookie（代替）

1. ブラウザで `http://localhost:3000` にログイン
2. DevTools → Application → Cookies
3. `next-auth.session-token` の値をコピー
4. 環境変数に設定:

```bash
export ALIGNMENT_AGENT_SESSION_COOKIE='next-auth.session-token=PASTE_VALUE_HERE'
```

### User-Authorization（任意: fuzzy 重複検索）

embedding 検索用。ログインユーザの OAuth `id_token` を MCP の `User-Authorization` ヘッダに渡す。

```bash
export ALIGNMENT_AGENT_USER_AUTH_TOKEN='eyJ...'
```

アクセストークン・Cookie のいずれも未設定の場合、書き込みツールは失敗する。`User-Authorization` 未設定時は embedding 検索がスキップされ、MCP レスポンスに `embeddingSkippedReason` が含まれる。

## 3. 基本コマンド

### スキャンのみ

```bash
npm run kg:align -- --topic-space-id=YOUR_TOPIC_SPACE_ID --dry-run
```

### 対話実行（ドラフト作成〜 checkpoint まで）

```bash
export ALIGNMENT_AGENT_SESSION_COOKIE='...'
npm run kg:align -- --topic-space-id=YOUR_TOPIC_SPACE_ID
```

### 文脈付きプラン

```bash
npm run kg:align -- --topic-space-id=YOUR_TOPIC_SPACE_ID --with-context
```

### 提出せずドラフトのみ残す

```bash
npm run kg:align -- --topic-space-id=YOUR_TOPIC_SPACE_ID --no-submit
```

### 中断後の再開

```bash
npm run kg:align -- --topic-space-id=YOUR_TOPIC_SPACE_ID --resume=2026-05-19T12-00-00-000Z
```

`runId` は `.alignment-runs/{topicSpaceId}/` 配下のフォルダ名（実行ログは Git 管理外。`.gitignore` 参照）。

テスト実行の総合レポート例: [.alignment-runs/test-run-2026-05-19.md](../../.alignment-runs/test-run-2026-05-19.md)

## 4. 対話フロー

1. **checkpoint A** — 実行カテゴリを選択（Space で選択、Enter で確定）
2. **plan** — LLM が `AlignmentPlan` を生成（ログ: `plan_generated`）
3. **checkpoint B** — マージ・ラベル・エッジ案を1件ずつ confirm
4. **execute** — MCP でドラフトに反映
5. **checkpoint C** — diff サマリを確認し、提出するか選択

## 5. 提出後

1. ターミナルに表示される `/proposals/{proposalId}` をブラウザで開く
2. 既存の変更提案 UI でレビュー・承認・マージ

## 6. ログの見方

```bash
ls .alignment-runs/YOUR_TOPIC_SPACE_ID/RUN_ID/
# events.jsonl  plan.json  summary.md
```

`events.jsonl` は監査用。`jq` でフィルタ例:

```bash
jq 'select(.type=="mcp_tool_result")' .alignment-runs/.../events.jsonl
```

## 7. トラブルシューティング

| 症状 | 想定原因 | 対処 |
|------|---------|------|
| `UNAUTHORIZED` / ドラフト作成失敗 | Cookie 未設定・期限切れ | Cookie を再取得 |
| fuzzy 候補が空 | `User-Authorization` 未設定 | トークン設定、または完全一致のみ |
| `TopicSpace が見つかりません` (404) | ID の typo（例: 末尾 `m` 欠落） | DB の正しい ID を確認（例: `...v38m`） |
| ツールが見つからない | MCP 接続 URL 誤り | `--base-url` と TopicSpace ID を確認 |
| `hasChanges: false` | マージ未適用 | checkpoint B・`events.jsonl` を確認 |
| MCP 接続エラー (`406 Not Acceptable`) | `@vercel/mcp-adapter` 経由で `Accept` ヘッダが欠落する既知問題 | MCP route を Web Standard transport 直結にしている。`npm run dev` を再起動してから再試行 |
| MCP 接続エラー | dev サーバー未起動 | `npm run dev` |

## 8. 安全運用

- 本番相当の TopicSpace では最初に `--dry-run` でスキャン結果を確認
- テスト用 TopicSpace で 1 グループだけ統合 → diff → 提出の流れを試す

## 9. 手動テスト（開発者向け）

1. `npm run dev`
2. 小さな TopicSpace で `--dry-run`
3. 同一環境でフル実行 → `/proposals/...` で diff 確認
4. `npm run test:e2e:kg` で `find-duplicate-edge-groups` ユニットテスト
