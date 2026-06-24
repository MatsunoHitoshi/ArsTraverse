# MCP 認証（外部クライアント向け）

ArsTraverse の TopicSpace MCP エンドポイント（`/api/topic-spaces/{id}/mcp`）は、読み取り系ツールは認証なしでも利用できます。ドラフト編集・変更提案の作成など書き込み系ツールには **ユーザー認証** が必要です。

## プラットフォーム MCP（ドキュメント作成・リポジトリ作成）

TopicSpace 単位ではなく、**グローバル**な操作向けエンドポイント:

```
http://localhost:3000/api/mcp
```

| ツール名                                   | 説明                                                                                            | 認証 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---- |
| `create_source_document_from_plain_text`   | プレーンテキスト → LLM 抽出 → SourceDocument 作成（本文は Supabase Storage `input-txt` に保存） | 必須 |
| `get_source_document_graph`                | 既存 SourceDocument のグラフをエクスポート                                                      | 必須 |
| `create_topic_space_from_source_documents` | 複数 SourceDocument ID → TopicSpace 作成・グラフ統合                                            | 必須 |
| `attach_documents_to_topic_space`          | 既存 TopicSpace に SourceDocument を追加・グラフ統合（provenance 記録）                          | 必須 |
| `detach_document_from_topic_space`         | TopicSpace から SourceDocument を 1 件切り離し（provenance 削除・共有ノードは保持）              | 必須 |
| `get_topic_space_graph`                    | TopicSpace 統合グラフをエクスポート（`provenance` / `sourceDocumentIds` 付き）                     | 必須 |
| `get_topic_space_change_history`           | TopicSpace のグラフ変更履歴一覧（`mergeOnly` で手動統合のみ）                                      | 必須 |
| `get_topic_space_change_history_detail`    | 変更履歴 1 件の詳細（`parsedMerge` 付き）                                                         | 必須 |
| `replay_node_merges_from_history`          | 手動統合履歴を解析して現在のグラフへ再適用（`dryRun` 可）                                          | 必須 |

### Storage（`create_source_document_from_plain_text`）

GUI のプレーンテキスト取り込みと同様、本文は **`input-txt` バケット** にアップロードし、その公開 URL を `SourceDocument.url` に保存します。サーバー側アップロードには ArsTraverse `.env` の **`SUPABASE_SERVICE_ROLE_KEY`** が必要です（ローカル Supabase のみ CLI `supabase status` からの自動取得も可）。

`NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` のプロジェクトが一致していないと、anon キーでのアップロードは失敗します。MCP は service role を使用するため、anon キーの不整合の影響を受けません。

### 取り込みフロー

1. `create_source_document_from_plain_text` を議事録ごとに実行 → `sourceDocumentId` を取得
2. `create_topic_space_from_source_documents` に ID 配列を渡して TopicSpace を作成
3. 返却された `mcpUrl`（`/api/topic-spaces/{id}/mcp`）で TopicSpace 固有の MCP ツールを利用

## ブラウザ認証

外部クライアント向けの標準方式です。ArsTraverse 側で追加の環境変数を設定する必要はありません。

1. ブラウザで `/mcp/authorize` を開く（クエリでクライアント名・TopicSpace を指定可能）
2. Google でログイン（既存 NextAuth）
3. **アクセス範囲**を選ぶ:
   - **プラットフォーム** — 議事録取り込み・TopicSpace 新規作成（TopicSpace が未作成でも可）
   - **TopicSpace** — グラフ検索・ドラフト編集（管理者権限が必要）
4. 「アクセスを許可」→ 表示された Bearer トークンをクライアント側に保存

```
# 初回取り込み（TopicSpace 未作成でも可）
http://localhost:3000/mcp/authorize?client=client-name

# TopicSpace 作成後（検索・編集も使う場合）
http://localhost:3000/mcp/authorize?client=client-name&topic_space_id=YOUR_TOPIC_SPACE_ID
```

トークンは `NEXTAUTH_SECRET` で署名された MCP アクセストークン（既定有効期限 90 日）です。発行ユーザー本人として操作できます。

クライアント側には、発行したトークンを **各自の `.env.local`** に保存します。

## 認証方式

| 順位 | 方式             | ヘッダー                                  | 用途                     |
| ---- | ---------------- | ----------------------------------------- | ------------------------ |
| 1    | アクセストークン | `Authorization: Bearer <mcp1....>`        | 外部クライアント（推奨） |
| 2    | セッション       | ブラウザ Cookie `next-auth.session-token` | ブラウザログイン済み接続 |
| 3    | なし             | —                                         | 読み取り専用ツールのみ   |

### embedding 検索（任意）

fuzzy 重複候補検索など embedding を使うツールでは、トークン／セッションに紐づくユーザーの Google `id_token` を DB から自動取得します（`User-Authorization` ヘッダーでも上書き可能）。

## Cursor / MCP クライアント設定例

`/mcp/authorize` 完了画面に表示される JSON をそのまま `mcp.json` に貼り付けてください。

```json
{
  "mcpServers": {
    "arstraverse-platform": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer mcp1...."
      }
    },
    "arstraverse-xxxxxxxx": {
      "url": "http://localhost:3000/api/topic-spaces/YOUR_TOPIC_SPACE_ID/mcp",
      "headers": {
        "Authorization": "Bearer mcp1...."
      }
    }
  }
}
```

- **platform** (`/api/mcp`) — 議事録テキストの取り込み、TopicSpace 新規作成
- **topic-space** (`/api/topic-spaces/{id}/mcp`) — グラフ検索・編集・変更提案

## kg-alignment-agent（CLI）

```bash
export ALIGNMENT_AGENT_MCP_ACCESS_TOKEN='mcp1....'
npm run kg:align -- --topic-space-id=YOUR_TOPIC_SPACE_ID --dry-run
```

## エラーレスポンス

| HTTP | 意味                                                          |
| ---- | ------------------------------------------------------------- |
| 401  | Bearer トークンが無効または期限切れ                           |
| 403  | トークンが当該 TopicSpace を許可していない                    |
| 500  | サーバー側 `NEXTAUTH_SECRET` 未設定（トークン発行・検証不可） |

## 関連ファイル

- `src/app/api/mcp/route.ts` — プラットフォーム MCP（ドキュメント・TopicSpace 作成）
- `src/app/mcp/authorize/page.tsx` — ブラウザ認証 UI
- `src/server/mcp/mcp-access-token.ts` — トークン発行・検証
- `src/server/mcp/resolve-mcp-auth.ts` — 認証解決
- `src/app/api/topic-spaces/[id]/mcp/route.ts` — MCP エンドポイント
