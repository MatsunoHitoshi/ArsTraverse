# TopicSpace ノード・エッジ provenance

TopicSpace に複数の SourceDocument を統合すると、同名・同ラベルのノードがマージされ、統合グラフ上の 1 ノードが複数ドキュメント由来になり得ます。**provenance** は、統合グラフ上の各ノード・エッジが「どの SourceDocument から来たか」を追跡する仕組みです。

## 目的

- **detach 時の安全な削除** — 他ドキュメントと共有している統合ノードは残し、当該ドキュメント由来の provenance のみ削除する
- **エクスポート・MCP 連携** — `get_topic_space_graph` や CLI エクスポートで `sourceDocumentIds` を付与する
- **手動統合の再適用** — ノードマージ時に provenance を代表ノードへ付け替える

## データモデル（Prisma）

| テーブル | 役割 |
|----------|------|
| `TopicSpaceDocumentNodeProvenance` | 統合ノード ID ↔ ドキュメント内ローカルノード ID ↔ SourceDocument ID |
| `TopicSpaceDocumentEdgeProvenance` | 統合エッジ ID ↔ SourceDocument ID |

`sourceDocumentId` は意図的に FK にしていません（ドキュメント削除時の扱いを単純化するため）。

### ノード provenance の列

| 列 | 説明 |
|----|------|
| `graphNodeId` | TopicSpace 統合グラフ上のノード ID |
| `localNodeId` | 元 DocumentGraph 上のノード ID（attach 時の対応表） |
| `sourceDocumentId` | 由来 SourceDocument |

## 記録タイミング

provenance は **グラフ統合（fuse）** のたびに書き込まれます。

| 操作 | サービス | 備考 |
|------|----------|------|
| TopicSpace 新規作成 | `create-topic-space-from-document.service.ts` | 最初のドキュメント + 追加 attach |
| ドキュメント attach | `attach-documents.service.ts` | MCP `attach_documents_to_topic_space` も同経路 |
| Google Drive 同期 | `sync-topic-space-drive.service.ts` | 新規・更新ファイル attach 時に記録 |
| Quick Commons 取り込み | `api/quick-commons/create/route.ts` | attach 経由 |

エッジ provenance は fuse で **新規追加された relationship** のみ記録します。ノード provenance は fuse の `nodeIdRecords`（ローカル ID → 統合 ID の対応）から生成します。

## provenance を記録しない経路

以下の操作は `fuseGraphs` または `applyTopicSpaceGraphDiff` でグラフを更新しますが、**`TopicSpaceDocumentNodeProvenance` / `TopicSpaceDocumentEdgeProvenance` 行は作成しません**。

| 経路 | サービス / API | 影響 |
|------|----------------|------|
| ノード詳細からのグラフ拡張 | `kg.integrateGraph` → `integrate-graph.service.ts` | 手動追加ノードは detach 時に名前・ラベル一致フォールバックのみ |
| 執筆 WS から TopicSpace へ直接統合 | 同上 | 同上 |
| ノードマージ | `merge-graph-nodes.service.ts` | 既存 provenance は代表ノードへ付け替え（新規作成ではない） |

### 運用上の意味

- **引用パネル**（`getNodeReference` の `scope=provenance`）に手動統合ノードは出ない — [ノード引用パネル](./node-reference-citations.md)
- **MCP / CLI エクスポート**の `sourceDocumentIds` が空のノードがあり得る
- **detach** 時、`resolveDetachedNodeIds` の対象外となり、他ドキュメントと名前・ラベルが一致するとレガシー `detachTopicSpaceGraphData` に依存する

手動統合後に provenance が必要な場合は、当該 SourceDocument を再 attach するか、MCP での追跡要件を別途検討する。

## detach 時の挙動

`detach-documents.service.ts` の流れ:

1. 切り離すドキュメントの node provenance 行を取得
2. `resolveDetachedNodeIds` で「他ドocument の provenance に存在しない graphNodeId」のみ削除対象にする
3. 削除対象ノードに接続するエッジ + 当該ドキュメントの edge provenance を削除
4. 当該ドキュメントの node / edge provenance 行を deleteMany

provenance が無いレガシーデータでは、名前・ラベル一致による `detachTopicSpaceGraphData` フォールバックを使用します。

## ノード統合（マージ）時

UI または MCP 経由でノードを統合すると:

- `merge-graph-nodes.service.ts` / `merge-proposal.service.ts` が `reassignTopicSpaceNodeProvenanceOnMerge` を呼ぶ
- 統合され消えるノード ID の provenance 行は、代表ノード（canonical）の `graphNodeId` へ updateMany

変更履歴の再適用は MCP `replay_node_merges_from_history`（`mergeOnly: true` で履歴取得 → `dryRun` 可）を参照。

## エクスポート形式

### MCP `get_topic_space_graph`

レスポンス例の構造:

```json
{
  "graph": {
    "nodes": [
      {
        "id": "...",
        "name": "...",
        "label": "...",
        "sourceDocumentIds": ["doc-a", "doc-b"]
      }
    ],
    "relationships": [
      {
        "id": "...",
        "sourceDocumentIds": ["doc-a"]
      }
    ]
  },
  "provenance": {
    "nodes": [
      {
        "graphNodeId": "...",
        "sourceDocumentId": "doc-a",
        "localNodeId": "..."
      }
    ],
    "relationships": [
      {
        "graphRelationshipId": "...",
        "sourceDocumentId": "doc-a"
      }
    ]
  }
}
```

- 各ノード/エッジの `sourceDocumentIds` は provenance 行から集約
- トップレベル `provenance` は生の対応表（デバッグ・再構築用）

### CLI

```bash
npm run export:topic-space -- --topic-space-id=<id> [--out=snapshot.json] [--user-id=<adminUserId>]
```

MCP と同じ `mcpGetTopicSpaceGraph` を呼び、`version` / `exportedAt` / `stats` を付けた JSON を出力します。管理者未指定時は TopicSpace の先頭 admin を使用します。

## フロントエンドでの DocumentGraph シリアライズ

TopicSpace 一覧やドキュメントリストでは、パフォーマンスのため `DocumentGraph` を **`id` のみ** で取得することがある（`sourceDocument.getList` の `graph: { select: { id: true } }`）。

`formTopicSpaceForFrontendPrivate` / `Public`（`src/app/_utils/kg/frontend-properties.ts`）は、ネストされた `sourceDocuments[].graph` を次のように正規化する:

| 取得内容 | フロント向け `graph` |
|----------|----------------------|
| `graphNodes` + `graphRelationships` あり | `formDocumentGraphForFrontend` で `dataJson` を構築 |
| 上記なし（`id` のみ等） | **`DocumentGraph` の Prisma フィールド（`id` 含む）を保持**し、`dataJson` は空グラフまたは既存 `dataJson` にフォールバック |

**なぜ重要か:** 以前は部分取得時に `dataJson` だけ返し `id` が欠落し、ドキュメントリストのグラフアイコンが `/graph/undefined` に遷移していた（PR #78）。UI 側も `document.graph?.id` の存在チェックを行う（`document-list.tsx` / `topic-graph-document-list.tsx`）。

## 関連ファイル

| パス | 役割 |
|------|------|
| `src/server/repositories/topic-space-document-provenance.repository.ts` | 読み取り・マージ時付け替え |
| `src/server/services/kg/topic-space-graph-fusion.service.ts` | fuse 時 provenance 生成・detach ノード解決 |
| `src/server/services/kg/attach-documents.service.ts` | attach 時 DB 書き込み |
| `src/server/services/kg/detach-documents.service.ts` | detach 時削除ロジック |
| `src/server/mcp/platform-handlers.ts` | MCP エクスポート |
| `scripts/export-topic-space-graph.ts` | CLI エクスポート |
| `src/app/_utils/kg/frontend-properties.ts` | TopicSpace / DocumentGraph のフロント向け正規化 |

## 関連ドキュメント

- [MCP 認証（プラットフォーム MCP ツール一覧）](./mcp-authentication.md)
- [Google Drive 同期](./topic-space-drive-sync.md)
- [TopicSpace グラフ拡張（integrateGraph）](./topic-space-graph-extension.md)
- [ノード引用パネル](./node-reference-citations.md)
