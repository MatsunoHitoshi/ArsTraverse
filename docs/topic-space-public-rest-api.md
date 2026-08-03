# TopicSpace 公開 REST API

TopicSpace の統合グラフや変更履歴を HTTP で取得する薄い REST ラッパー。内部では tRPC の `publicProcedure` を呼び出す。MCP（`/api/topic-spaces/{id}/mcp`）とは別の統合面 — シンプルな GET/POST クライアント向け。

認証は **不要**（`publicProcedure`）。削除済み TopicSpace は 404 相当のエラー。

## エンドポイント一覧

| メソッド | パス | 説明 |
|----------|------|------|
| `GET` | `/api/topic-spaces/{id}` | 統合グラフ JSON |
| `GET` | `/api/topic-spaces/{id}/path/{start_id}/{end_id}` | 2 ノード間最短経路の部分グラフ |
| `GET` | `/api/topic-spaces/{id}/nodes/{node_id}` | ノードの近傍部分グラフ |
| `GET` | `/api/topic-spaces/{id}/history` | 変更履歴一覧 |
| `POST` | `/api/topic-spaces/{id}/embeddings` | 埋め込みキュー作成 |

MCP エンドポイントは [MCP 認証](./mcp-authentication.md) を参照。

## GET `/api/topic-spaces/{id}`

**tRPC**: `topicSpaces.getByIdPublic`

### クエリパラメータ

| パラメータ | 説明 |
|------------|------|
| `tag` | 任意。`filterOption: { type: "tag", value: tag, cutOff: "2" }` でノードをタグフィルタ |

### レスポンス

```json
{
  "id": "clxxx...",
  "graphData": {
    "nodes": [ /* CustomNodeType[] */ ],
    "relationships": [ /* RelationshipType[] */ ]
  }
}
```

`formTopicSpaceForFrontendPublic` 経由でロケール付きノード名（`name_ja` / `name_en`）が解決される。セッションがある場合は `preferredLocale` を使用。

## GET `/api/topic-spaces/{id}/path/{start_id}/{end_id}`

**tRPC**: `topicSpaces.getPath`

2 ノード間の最短経路（BFS）上のノード・エッジのみを返す部分グラフ。

```json
{
  "id": "clxxx...",
  "graphData": { "nodes": [...], "relationships": [...] }
}
```

## GET `/api/topic-spaces/{id}/nodes/{node_id}`

**tRPC**: `topicSpaces.getByIdPublic`（クライアント側で近傍抽出）

1. 全ノードから `properties.tag === "main"`（大文字小文字無視）のノードのみ抽出
2. `{node_id}` に接続するエッジと、そのエッジの両端ノード（`main` タグ内）を返す

```json
{
  "id": "clxxx...",
  "graphData": {
    "nodes": [ /* 近傍ノード */ ],
    "relationships": [ /* 近傍エッジ */ ]
  }
}
```

近傍が空の場合はソースノード単体を返す。Quick Commons 連携（`/api/quick-commons/*`）でも同様の `getByIdPublic` を利用。

## GET `/api/topic-spaces/{id}/history`

**tRPC**: `topicSpaceChangeHistory.listByTopicSpaceId({ id, includeDetail: true })`

```json
{
  "changeHistories": [
    {
      "id": "...",
      "recordId": "...",
      "recordType": "TOPIC_SPACE",
      "description": "...",
      "createdAt": "...",
      "user": { /* ... */ },
      "nodeLinkChangeHistories": [ /* includeDetail: true */ ]
    }
  ]
}
```

新しい順（`createdAt: desc`）。マージ・手動編集・ロールバック等の履歴が含まれる。ロールバック操作は tRPC `graphEditProposal.rollbackChange`（認証必須）— REST では履歴の参照のみ。

## POST `/api/topic-spaces/{id}/embeddings`

**tRPC**: `graphEmbedding.createEmbeddingQueue({ topicSpaceId })`

ノード名埋め込みと TransE 埋め込みのキューを作成。Cron が 1 分ごとに処理:

- `/api/cron/node-name-embedding`
- `/api/cron/trans-e-embedding`

成功時はジョブオブジェクトを JSON で返す。失敗時は `500` + `{ "message": "Internal server error." }`。

## 使用例

```bash
# 統合グラフ取得
curl https://example.com/api/topic-spaces/CLxxx

# タグフィルタ
curl "https://example.com/api/topic-spaces/CLxxx?tag=main"

# 最短経路
curl https://example.com/api/topic-spaces/CLxxx/path/nodeA/nodeB

# ノード近傍
curl https://example.com/api/topic-spaces/CLxxx/nodes/nodeA

# 変更履歴
curl https://example.com/api/topic-spaces/CLxxx/history

# 埋め込みキュー作成
curl -X POST https://example.com/api/topic-spaces/CLxxx/embeddings
```

## 関連ファイル

- `src/app/api/topic-spaces/[id]/route.ts`
- `src/app/api/topic-spaces/[id]/path/[start_id]/[end_id]/route.ts`
- `src/app/api/topic-spaces/[id]/nodes/[node_id]/route.ts`
- `src/app/api/topic-spaces/[id]/history/route.ts`
- `src/app/api/topic-spaces/[id]/embeddings/route.ts`
- `src/server/api/routers/topic-space.ts` — `getByIdPublic`, `getPath`
- `src/server/api/routers/topic-space-change-history.ts`
- `src/server/api/routers/graph-embedding.ts`

## 関連ドキュメント

- [MCP 認証](./mcp-authentication.md) — 書き込み・検索向け MCP ツール
- [TopicSpace ノード・エッジ provenance](./topic-space-node-provenance.md) — グラフ JSON の provenance フィールド
- [グラフ変更提案](./graph-edit-proposal-flow.md) — 変更履歴のマージ・ロールバック
