# 外部 Workspace REST API

外部 Web アプリ（例: SOS）が ArsTraverse の **執筆 Workspace** を同期するための REST エンドポイント。Tiptap 本文（`content`）、キュレトリアルコンテキスト、執筆履歴の取得・復元、共同編集者の追加を HTTP で行える。

MCP（`/api/mcp`）や TopicSpace 公開 REST API（`/api/topic-spaces/{id}`）とは別の統合面 — **認証必須** の執筆データ向け。

## 認証

[MCP 認証](./mcp-authentication.md) と同じ方式:

| 順位 | 方式             | ヘッダー                                  |
| ---- | ---------------- | ----------------------------------------- |
| 1    | アクセストークン | `Authorization: Bearer <mcp1....>`        |
| 2    | セッション       | ブラウザ Cookie `next-auth.session-token` |

トークンは `/mcp/authorize` で発行（**プラットフォーム** スコープで十分。TopicSpace 未作成でも Workspace API は利用可能）。外部 Web アプリ連携では `redirect_uri` + `EXTERNAL_OAUTH_REDIRECT_URIS` による OAuth 風コールバックも利用できる（詳細は [MCP 認証 — 外部 OAuth リダイレクト](./mcp-authentication.md#外部-oauth-リダイレクトweb-アプリ連携)）。

新規作成時、トークンに紐づくユーザーが Workspace の **所有者** になる。読み書きは、ログイン済み（有効なトークンまたはセッション）であれば所有者や共同編集者でなくてもできる。未認証は `401`。

## 識別子: `source` + `sourceKey`

| フィールド   | 説明                                                         |
| ------------ | ------------------------------------------------------------ |
| `source`     | 外部アプリ識別子（例: `sos`）                                |
| `sourceKey`  | アプリ内の一意キー（例: 記事 slug、外部 ID）                 |

DB 上は `@@unique([source, sourceKey])`。同一ペアは 1 Workspace にマップされる。

- **作成**: `PUT` で存在しなければ新規作成（所有者 = 認証ユーザー）
- **更新**: 認証済みユーザーが `content` 等を更新できる
- **論理削除後の復活**: 削除済み（`isDeleted: true`）の同一 `source`/`sourceKey` を `PUT` すると、認証済みユーザーが復活できる

GUI から作成した Workspace は `source` / `sourceKey` が `null` のため、この API の upsert キーには使えない。

## エンドポイント一覧

| メソッド | パス                                     | 説明                                      |
| -------- | ---------------------------------------- | ----------------------------------------- |
| `GET`    | `/api/external/me`                       | 認証ユーザー情報                          |
| `GET`    | `/api/external/workspaces`               | `source` 単位の一覧、または 1 件取得      |
| `PUT`    | `/api/external/workspaces`               | `source` + `sourceKey` による upsert      |
| `DELETE` | `/api/external/workspaces`               | `source` + `sourceKey` の論理削除         |
| `GET`    | `/api/external/workspaces/history`       | 執筆履歴一覧                              |
| `POST`   | `/api/external/workspaces/history`       | 履歴から本文を復元                        |
| `GET`    | `/api/external/workspaces/usage-log`     | 利用ログ（本文＋グラフイベント、新しい順） |
| `GET`    | `/api/external/workspaces/usage-activity`| `source` 横断の活動トレンド集計           |
| `GET`    | `/api/external/workspaces/curation-history` | SOS 整備履歴一覧（`グラフ整備` プレフィックス） |
| `POST`   | `/api/external/workspaces/curation-history` | 整備履歴の取り消し（最新版のみ）        |
| `POST`   | `/api/external/workspaces/collaborators` | **所有者のみ** collaborator 追加            |
| `GET`    | `/api/external/drive/browse`             | Drive フォルダを 1 階層ずつ一覧（画像＋子フォルダ） |
| `GET`    | `/api/external/drive/files`              | フォルダ内の画像一覧（直下＋1 階層の子フォルダ） |
| `GET`    | `/api/external/drive/files/{fileId}/content` | 画像バイナリ（`image/*` のみ）        |

## GET `/api/external/me`

認証済みユーザーの公開プロフィールを返す。

```json
{
  "user": {
    "id": "clxxx...",
    "name": "Curator Name",
    "email": "curator@example.com",
    "image": "https://..."
  }
}
```

`email` は認証した本人のアドレスだけ返す。履歴の `changedBy` など、他のユーザーを含む応答には含めない。

## GET `/api/external/workspaces`

### クエリパラメータ

| パラメータ  | 必須 | 説明                                                         |
| ----------- | ---- | ------------------------------------------------------------ |
| `source`    | はい | 外部アプリ識別子                                             |
| `sourceKey` | 任意 | 指定時は 1 件取得。未指定時は `source` に属する一覧（`updatedAt` 降順） |

認証済みユーザーは、指定した `source` の Workspace を一覧・取得できる。該当なしは `404`（単件）または空配列（一覧）。

### レスポンス（単件）

```json
{
  "workspace": {
    "id": "clxxx...",
    "source": "sos",
    "sourceKey": "article-42",
    "name": "記事タイトル",
    "description": null,
    "status": "DRAFT",
    "content": { "type": "doc", "content": [ /* TipTap JSON */ ] },
    "curatorialContext": { "stance": "...", "extractionRules": {} },
    "createdAt": "2026-08-31T12:00:00.000Z",
    "updatedAt": "2026-08-31T12:30:00.000Z"
  }
}
```

### レスポンス（一覧）

```json
{
  "workspaces": [ /* ExternalWorkspaceDto[] */ ]
}
```

`status` は `DRAFT` | `IN_PROGRESS` | `REVIEW` | `PUBLISHED` | `ARCHIVED`。

## PUT `/api/external/workspaces`

`source` + `sourceKey` で upsert。本文更新時は執筆履歴を自動記録（下記「執筆履歴」）。

### リクエストボディ

| フィールド           | 必須 | 説明                                                         |
| -------------------- | ---- | ------------------------------------------------------------ |
| `source`             | はい | 外部アプリ識別子                                             |
| `sourceKey`          | はい | アプリ内一意キー                                             |
| `name`               | 任意 | 表示名。未指定時は既存値維持（新規は `sourceKey`）           |
| `description`        | 任意 | `null` でクリア可能                                          |
| `content`            | 任意 | TipTap doc JSON（`{ type: "doc", content?: [...] }`）        |
| `curatorialContext`  | 任意 | キュレトリアルコンテキスト（`stance`, `extractionRules`, `negativeArchive` 等） |
| `status`             | 任意 | `WorkspaceStatus` 列挙値                                     |
| `changeDescription`  | 任意 | 履歴に残す変更説明（既定: 「内容を更新しました」）           |
| `recordHistory`      | 任意 | `false` で履歴記録をスキップ（既定: `true`）               |
| `forceHistory`       | 任意 | `true` で 30 秒スロットルを無視して履歴を必ず 1 件残す     |

### レスポンス

```json
{ "workspace": { /* ExternalWorkspaceDto */ } }
```

### エラー

| HTTP | 条件                                                         |
| ---- | ------------------------------------------------------------ |
| 400  | `source` / `sourceKey` 欠落                                  |
| 401  | トークン・セッション無効。認証済みなら所有者でなくても更新できる |

## DELETE `/api/external/workspaces`

`source` + `sourceKey` で Workspace を **論理削除**（`isDeleted: true`）。既に削除済みの行はそのまま `{ ok: true }` を返す。一覧・単件 GET は削除済みを返さない（`404` / 一覧から除外）。

### クエリパラメータ

| パラメータ  | 必須 | 説明           |
| ----------- | ---- | -------------- |
| `source`    | はい | 外部アプリ識別子 |
| `sourceKey` | はい | アプリ内一意キー |

```json
{ "ok": true }
```

該当 Workspace が存在しない場合は `404`。

## GET `/api/external/workspaces/history`

### クエリパラメータ

| パラメータ    | 必須 | 説明                    |
| ------------- | ---- | ----------------------- |
| `workspaceId` | はい | Workspace ID            |

最大 **50 件**（`createdAt` 降順）。

| フィールド | 説明 |
| ---------- | ---- |
| `preview` / `previousPreview` | TipTap 本文のプレーンテキスト要約（空白正規化、最大 160 文字） |
| `previousText` / `currentText` | 段落改行を残した全文。差分表示向け |
| `hasGraph` | この版にライブグラフのスナップショットがあるか |
| `graphSummary` | グラフ差分の短い要約（例: `+2ノード · −1関係`） |
| `graphDiff` | 追加・削除・更新・**プロパティのみ**変更されたノード／関係。`summary.propertyChangeCount` で件数。変化がなければ `null` |

```json
{
  "histories": [
    {
      "id": "clhist...",
      "workspaceId": "clxxx...",
      "changeDescription": "内容を更新しました",
      "preview": "美術大学と美大生 相模原市は…",
      "previousPreview": "",
      "previousText": "",
      "currentText": "美術大学と美大生\n相模原市は美大生のまちです。",
      "hasGraph": true,
      "graphSummary": "+1ノード · +1関係",
      "graphDiff": {
        "nodes": [
          { "change": "added", "id": "n1", "name": "桶屋", "label": "Studio" }
        ],
        "relationships": [],
        "summary": {
          "addedNodeCount": 1,
          "removedNodeCount": 0,
          "updatedNodeCount": 0,
          "addedRelationshipCount": 0,
          "removedRelationshipCount": 0,
          "updatedRelationshipCount": 0,
          "metaChanged": false
        }
      },
      "createdAt": "2026-08-31T12:30:00.000Z",
      "changedBy": { "id": "...", "name": "...", "image": "..." }
    }
  ]
}
```

## POST `/api/external/workspaces/history`

履歴 1 件の保存時点の本文（`currentContent`）とグラフを Workspace に復元する。表示中の差分だけを打ち消すのではなく、その版のスナップショット全体へ巻き戻す。グラフは `currentGraph` を使う。`previousGraph` だけある行は、この版にグラフが残っていないものとして本文のみ戻す。両方無いレガシー行だけ、前後の履歴から当時のグラフを補う。それでもグラフが無い履歴は本文のみ戻す。復元操作自体も履歴に記録される（`changeDescription`: 「履歴から復元しました」）。

### リクエストボディ

```json
{
  "workspaceId": "clxxx...",
  "historyId": "clhist..."
}
```

### レスポンス

```json
{ "workspace": { /* 復元後の ExternalWorkspaceDto */ } }
```

## POST `/api/external/workspaces/collaborators`

共同編集者でなくても、認証済みユーザーは Workspace を読み書きできる。このエンドポイントで共同編集者を追加できるのは、これまでどおり **Workspace 所有者のみ**。

### リクエストボディ

| フィールド    | 必須 | 説明                                      |
| ------------- | ---- | ----------------------------------------- |
| `workspaceId` | はい | 対象 Workspace ID                         |
| `userId`      | 任意 | 追加するユーザーの ID（`userEmail` と排他） |
| `userEmail`   | 任意 | 追加するユーザーのメール（ArsTraverse 登録済み） |

所有者自身を collaborator に追加は `400`。対象ユーザー未登録は `404`。

```json
{
  "workspaceId": "clxxx...",
  "collaborator": { "id": "...", "name": "...", "image": "..." }
}
```

## GET `/api/external/workspaces/usage-log`

SOS など外部アプリ向けの **利用ログ**。執筆履歴行を `classifyGraphEvents` でグラフイベント列に展開し、30 秒スロットルで落ちた差分を **合成 ID** で補完する（`expandUsageLogEntries`）。配列は **新しい順**。

### クエリパラメータ

| パラメータ    | 必須 | 説明 |
| ------------- | ---- | ---- |
| `workspaceId` | はい | Workspace ID |
| `take`        | 任意 | 取得する履歴行数の上限（1〜500、既定 500）。`truncated: true` はさらに古い行がある |
| `historyId`   | 任意 | 指定時は一覧ではなく、そのログ行に対応する **ライブグラフ JSON** を `currentGraph` として返す |

`historyId` の特殊値:

| ID | 意味 |
| -- | ---- |
| `unrecorded:workspace` | 現在保存されている `curatorialContext` 内のライブグラフ |
| `unrecorded:{olderId}:{newerId}` | 2 つの履歴行のあいだに残っていた変更（`changeDescription`: 「履歴の間隔に残っていた変更です」） |
| 通常の `WritingHistory.id` | その行の `currentGraph` |

### レスポンス（一覧）

```json
{
  "truncated": false,
  "histories": [
    {
      "id": "clhist...",
      "workspaceId": "clxxx...",
      "changeDescription": "内容を更新しました",
      "previousText": "",
      "currentText": "相模原市は…",
      "graphEvents": [
        {
          "kind": "node",
          "change": "added",
          "origin": "image",
          "id": "n1",
          "name": "工房",
          "label": "Concept"
        }
      ],
      "createdAt": "2026-08-31T12:30:00.000Z",
      "changedBy": { "id": "...", "name": "...", "image": "..." }
    }
  ]
}
```

`graphEvents` の `origin` は `sketch` | `manual` | `llm` | `image` | `unknown`。画像ストック由来の下書きノードは `properties.graphSource: "image"` から `image` に分類される。`change` は `added` | `removed` | `updated` | `promoted` | `property`。

合成行の `changedBy.id` は `unrecorded`（名前・画像は `null`）。

### レスポンス（`historyId` 指定）

```json
{ "currentGraph": { "nodes": [], "relationships": [] } }
```

## GET `/api/external/workspaces/usage-activity`

指定 `source` に属する全 Workspace（未削除）の利用ログを横断し、**活動があった時点**だけを時系列で返す。既定 `source` は `sos-research`（クエリ未指定時）。

各ポイントは 1 ログ行相当で、グラフ **追加**（手入力・下書き・画像・LLM・unknown）と `promoted`、および本文の **純増文字数** `textAdded` を集計する。削除やプロパティのみ変更はカウントに含めない。

```json
{
  "truncated": false,
  "points": [
    {
      "at": "2026-08-31T12:30:00.000Z",
      "slug": "article-42",
      "title": "美大生のまち",
      "manual": 0,
      "sketch": 1,
      "image": 0,
      "promoted": 0,
      "llm": 0,
      "unknown": 0,
      "textAdded": 120
    }
  ]
}
```

`points` は `at` 降順。Workspace ごとに usage-log と同様最大 500 履歴行を見るため、全体で `truncated: true` になり得る。

## GET / POST `/api/external/workspaces/curation-history`

SOS リサーチ／コンセプト Workspace（`source` が `sos-research` または `sos-research-concept`）で、`changeDescription` が **`グラフ整備` で始まる** 執筆履歴だけを外部向けに一覧・取り消しする。

### GET

最大 **80** 件（`createdAt` 降順）。各項目に、その Workspace の最新履歴 ID（`latestHistoryId`）を付与し、取り消し可否の判断に使える。

```json
{
  "histories": [
    {
      "id": "clhist...",
      "workspaceId": "clxxx...",
      "source": "sos-research",
      "sourceKey": "article-42",
      "title": "美大生のまち",
      "changeDescription": "グラフ整備: ノードを整理",
      "graphSummary": "+1ノード · −1関係",
      "createdAt": "2026-08-31T12:30:00.000Z",
      "changedByName": "Curator Name",
      "latestHistoryId": "clhist...",
      "latestChangeDescription": "グラフ整備: ノードを整理"
    }
  ]
}
```

### POST（取り消し）

```json
{ "historyIds": ["clhist...", "clhist2..."] }
```

- 対象は **整備履歴のみ**。それ以外は `409`（「整備以外の履歴は取り消せません」）。
- 各 Workspace について、指定 ID のいずれかが **最新履歴** でなければ `409`（「このあとに別の保存があるため…」）。
- 複数 ID を渡した場合、同一 Workspace 内では **最も古い** 整備行の `previousContent` / `previousGraph` に戻す。concept リダイレクトは `previousGraph` スナップショットから復元する。
- 取り消し自体も執筆履歴に残る（`changeDescription`: 「整備の変更を取り消しました」）。

```json
{ "undone": 1 }
```

## Google Drive（外部 API）

認証ユーザーの **Google Drive OAuth 連携**（[Drive 同期](./topic-space-drive-sync.md) と同じ `UserGoogleDriveConnection`）を使い、SOS 等の UI から画像を選ぶための読み取り専用 API。未連携は `409` と `connected: false`（browse/files は空配列付き）。

| エンドポイント | 用途 |
| -------------- | ---- |
| `GET .../drive/browse` | ルート `within` の配下だけを辿る **1 フォルダずつ**のブラウズ（子フォルダ＋直下画像） |
| `GET .../drive/files` | 互換用。`folderId` 直下の画像と **1 階層だけ** ネストした子フォルダ内画像をまとめて返す |
| `GET .../drive/files/{fileId}/content` | 画像のバイナリ（`Content-Type` は Drive の MIME） |

### GET `/api/external/drive/browse`

| パラメータ | 必須 | 説明 |
| ---------- | ---- | ---- |
| `within`   | はい | 許可ルートフォルダ ID（SOS 側で固定したルート） |
| `folderId` | 任意 | 開くフォルダ。未指定時は `within` 自体を一覧 |
| `fileId`   | 任意 | 指定時は一覧せず、`within` の配下に `fileId` があるか `{ connected, inside }` だけ返す |

`folderId` が `within` の外にある場合は `404`。成功時:

```json
{
  "connected": true,
  "folderId": "1AbC...",
  "folders": [{ "id": "...", "name": "2024" }],
  "files": [
    {
      "id": "...",
      "name": "photo.jpg",
      "mimeType": "image/jpeg",
      "modifiedTime": "2026-01-01T00:00:00.000Z",
      "webViewLink": "https://..."
    }
  ]
}
```

### GET `/api/external/drive/files`

| パラメータ | 必須 | 説明 |
| ---------- | ---- | ---- |
| `folderId` | はい | 画像を集めるフォルダ ID |

```json
{ "connected": true, "files": [ /* DriveImageFile[] */ ] }
```

### GET `/api/external/drive/files/{fileId}/content`

`image/*` 以外は `400`。Drive API 障害・権限不足は `502`。

## 執筆履歴の記録ルール

`content` または `curatorialContext`（ライブグラフ）の更新時、`recordWritingHistoryIfNeeded` が呼ばれる（`recordHistory: false` で無効化可能）。`forceHistory: true` のときは 30 秒スロットルを無視する。

```mermaid
flowchart TD
    A[content またはグラフ更新] --> B{本文とグラフが<br/>前回と同一?}
    B -->|はい| Z[記録しない]
    B -->|いいえ| C{force または<br/>前回から 30 秒以上?}
    C -->|はい| D[WritingHistory 作成<br/>本文スナップショット + グラフ差分元]
    C -->|いいえ| Z
```

- **スロットル**: 直近の履歴から **30 秒** 以内の連続保存は 1 件にまとめる（`DEFAULT_WRITING_HISTORY_INTERVAL_MS`）
- **同一判定（本文）**: JSON 文字列一致、または TipTap プレーンテキスト一致（`blockId` 等の属性差は無視）
- **同一判定（グラフ）**: `updatedAt` を除いたライブグラフ JSON 一致
- **保存内容**: `previousContent` / `currentContent` に加え `previousGraph` / `currentGraph`
- **強制記録**: 新規作成・履歴復元・抽出完了（`forceHistory`）は即時記録
- GUI の執筆履歴モーダル（`WritingHistoryModal`）も同じ `writingHistory` テーブルを参照

## tRPC 相当

ブラウザ内の ArsTraverse UI は tRPC `workspace` ルーターを使用。外部 REST と共有するサービス層:

| REST | tRPC |
| ---- | ---- |
| `PUT /api/external/workspaces` | `workspace.upsertBySource` |
| `GET .../history` | `workspace.getWritingHistory` |
| `POST .../history` | `workspace.restoreWritingHistory` |
| `POST .../collaborators` | `workspace.addCollaborator`（REST は `userEmail` 解決を追加） |

## 使用例

```bash
export TOKEN="mcp1...."
export BASE="http://localhost:3000"

# 認証ユーザー確認
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/external/me"

# 外部キーで upsert（新規 or 更新）
curl -s -X PUT "$BASE/api/external/workspaces" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "sos",
    "sourceKey": "article-42",
    "name": "美大生のまち",
    "content": {
      "type": "doc",
      "content": [{
        "type": "paragraph",
        "content": [{ "type": "text", "text": "相模原市は美大生のまちです。" }]
      }]
    },
    "changeDescription": "SOS から同期"
  }'

# 一覧取得
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/external/workspaces?source=sos"

# 単件取得
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/external/workspaces?source=sos&sourceKey=article-42"

# 執筆履歴
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/external/workspaces/history?workspaceId=WORKSPACE_ID"

# 履歴から復元
curl -s -X POST "$BASE/api/external/workspaces/history" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId":"WORKSPACE_ID","historyId":"HISTORY_ID"}'

# 共同編集者追加（所有者のみ）
curl -s -X POST "$BASE/api/external/workspaces/collaborators" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspaceId":"WORKSPACE_ID","userEmail":"collaborator@example.com"}'

# 論理削除
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/external/workspaces?source=sos&sourceKey=article-42"

# 利用ログ
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/external/workspaces/usage-log?workspaceId=WORKSPACE_ID&take=100"

# 活動トレンド（source 省略時 sos-research）
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/external/workspaces/usage-activity?source=sos-research"

# 整備履歴
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/external/workspaces/curation-history"

# Drive フォルダを 1 階層開く
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/external/drive/browse?within=ROOT_FOLDER_ID&folderId=ROOT_FOLDER_ID"
```

### Web アプリ OAuth 連携（概要）

1. ArsTraverse `.env` に `EXTERNAL_OAUTH_REDIRECT_URIS` を設定
2. ユーザーを `/mcp/authorize?client=...&redirect_uri=...&state=...` にリダイレクト
3. Google ログイン → 「アクセスを許可」
4. `redirect_uri?token=...&expires_at=...&state=...` でトークン受取
5. 以降、上記 REST を `Authorization: Bearer` で呼び出す

## 関連ファイル

- `src/app/api/external/me/route.ts`
- `src/app/api/external/workspaces/route.ts`
- `src/app/api/external/workspaces/history/route.ts`
- `src/app/api/external/workspaces/usage-log/route.ts`
- `src/app/api/external/workspaces/usage-activity/route.ts`
- `src/app/api/external/workspaces/curation-history/route.ts`
- `src/app/api/external/workspaces/collaborators/route.ts`
- `src/app/api/external/drive/browse/route.ts`
- `src/app/api/external/drive/files/route.ts`
- `src/app/api/external/drive/files/[fileId]/content/route.ts`
- `src/server/services/workspace/external-workspace.ts` — upsert・削除・usage・整備 undo
- `src/server/services/workspace/usage-log-entries.ts` — 合成 unrecorded ID・gap 補完
- `src/server/services/workspace/usage-activity.ts` — 活動ポイント集計
- `src/server/services/workspace/workspace-graph-history.ts` — graphDiff・graphEvents・origin
- `src/server/lib/google-drive/list-images.ts` — browse / 画像一覧
- `src/server/services/workspace/writing-history.ts` — 履歴スロットル・プレビュー
- `src/server/services/workspace/resolve-external-auth.ts` — 認証解決
- `src/server/api/routers/workspace.ts` — tRPC `upsertBySource` 等
- `src/app/_components/curators-writing-workspace/writing-history-modal.tsx` — GUI 履歴 UI
- `prisma/schema.prisma` — `Workspace`, `WritingHistory` モデル

## 関連ドキュメント

- [MCP 認証](./mcp-authentication.md) — トークン発行・OAuth リダイレクト
- [執筆体験とデータの関係](./concept-writing-experience.md) — Workspace 本文とグラフ・ストーリーの概念
- [データ連携の概念](./concept-writing-data-linkage.md) — TipTap `content` と知識グラフの連携
- [TopicSpace 公開 REST API](./topic-space-public-rest-api.md) — グラフ JSON 取得（認証不要・別統合面）
- [Google Drive 同期](./topic-space-drive-sync.md) — ユーザー OAuth 連携（外部 Drive API の前提）
