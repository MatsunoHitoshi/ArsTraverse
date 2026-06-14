# フィールドリサーチ：現地スキャンから知識グラフ作成（処理フロー）

展示・資料・看板などをカメラで撮影し、クライアント側 OCR → LLM 整形 → 知識グラフ抽出までを一気通貫で行うモバイル向けフロー。保存後は `INPUT_SCAN` 型のソースドキュメントとして永続化される。

## ルーティング

| パス | 役割 |
|------|------|
| `/field` | スキャンセッション一覧（要ログイン） |
| `/field/scan` | 新規スキャン（カメラ → 領域調整 → プレビュー） |
| `/field/scan/[id]` | 保存済みセッション詳細（テキスト・画像・グラフ・一致候補） |

`/field` 配下は `SPGuardProvider` によりスマートフォンでも利用可能（他ページは PC・タブレット推奨）。

## 処理フロー図

```mermaid
flowchart TB
    subgraph Capture["1. 画像取得 (camera)"]
        A[ライブカメラ or ファイル選択 or ネイティブカメラ]
        B[画像回転 90° CCW（任意）]
    end

    subgraph Trim["2. 領域調整 (trim)"]
        C[ScanRegionSelector で正規化 ROI を指定]
        D[言語選択: jpn / jpn_vert / eng]
    end

    subgraph Pipeline["3. パイプライン (processing)"]
        E[runOcrOnRegions — tesseract.js]
        F[normalizeOcrText — gpt-5-nano]
        G[extractKGFromPlainText — サーバ KG 抽出]
    end

    subgraph Preview["4. プレビュー (preview)"]
        H[テキスト編集・グラフ再抽出]
        I[GraphSummary: ノード/エッジ編集・一致候補表示]
        J[searchNodeMatchesByNames — 既存リソース照合]
    end

    subgraph Persist["5. 保存"]
        K[クライアントで Supabase に画像・テキストをアップロード]
        L[createFromScan — graphDocument をそのまま保存]
        M[/field/scan/{id} へ遷移]
    end

    A --> B --> C
    C --> D --> E --> F --> G --> H
    H --> I
    H --> J
    I --> K --> L --> M
```

## クライアント OCR

- **エンジン**: `tesseract.js`（動的 import、ワーカーは処理後に terminate）
- **領域**: `NormalizedOcrRegion` は画像に対する 0–1 の正規化座標 `{ x, y, w, h }`。複数領域は順に OCR し、結果を `\n\n` で結合
- **デフォルト ROI**: 中央 85%×75%（`DEFAULT_OCR_REGION`）。キャプション余白を避ける想定
- **言語**: `jpn`（横書き）/ `jpn_vert`（縦書き）/ `eng`

### カメラキャプチャ

`camera-capture.ts` は解像度のフォールバックチェーンを持つ（4K → 1080p → 720p → facingMode のみ）。`ImageCapture` API が使える場合は `takePhoto()` を優先し、不可なら `<video>` + `<canvas>` で静止画化（JPEG 品質 0.95）。

カメラ起動に失敗した場合はファイル選択・ネイティブ `<input capture>` へ誘導する。

## サーバ API（`scan` ルーター）

| プロシージャ | 種別 | 用途 |
|-------------|------|------|
| `createFromScan` | mutation | セッション作成。`graphDocument` 指定時は再抽出せずプレビュー内容を保存 |
| `listSessions` | query | ユーザーの `INPUT_SCAN` 一覧（ページネーション） |
| `getSession` | query | 詳細（plainText, graph, matchCandidates, ocrMetadata） |
| `deleteSession` / `renameSession` | mutation | セッション管理 |
| `normalizeOcrText` | mutation | OCR 後のノイズ除去（最大 50,000 文字） |
| `searchNodeMatchesByNames` | query | 抽出ノード名と既存リソースの名前一致検索 |

### `createFromScan` の保存内容

- `documentType`: `INPUT_SCAN`
- `url`: OCR プレーンテキスト（Supabase `PATH_TO_INPUT_TXT`）
- `sourceImageUrl`: スキャン画像（`PATH_TO_INPUT_SCAN`）。クライアント事前アップロードを推奨（`sourceImageUrl` / `sourceTextUrl`）
- `ocrMetadata`: エンジン・言語・信頼度・`regions`・`plainText`（ストレージ URL が取れない場合のフォールバック表示用）
- `topicSpaceId`（任意）: 指定時は作成後にトピックスペースへドキュメントを紐付け

**制約**: `plainText` は空不可。`graphDocument` 未指定時のみサーバ側で `runExtractKGFromPlainText` を再実行する。

## 既存リソースとの一致候補

`searchUserNodeMatchesByNames` は次の 2 ソースをマージする（重複 `nodeId` は除外、上限 `limit`）。

1. **トピックスペース** — ユーザが管理者のトピックスペース内ノード（大文字小文字無視の名前一致）
2. **ソースドキュメント** — 同一ユーザの `INPUT_PDF` / `INPUT_TXT` / `INPUT_SCAN`（保存対象 ID は `excludeSourceDocumentId` で除外可）

プレビュー段階では最大 200 ノード名、保存後詳細では `nodes.length * 5`（20–100）件まで照合。

## グラフ編集 UI

`GraphSummary` はプレビュー・詳細の両方で利用。

- **編集モード**: ノード名・`properties.description`、リレーションの `type`・`description` をモーダルで編集
- **プレビュー**: `onGraphChange` でローカル state を更新（保存前）
- **詳細**: `documentGraph.updateGraph` で即時サーバ保存。`preferredLocale` に応じ `name_{locale}` プロパティを同期
- **一致候補の再取得**: ノード名変更時に `onRefreshNodeMatches`（詳細画面では `refetch`）

## プレーンテキストの解決

`INPUT_SCAN` の本文取得は `resolveScanPlainText` が担当。

1. `ocrMetadata.plainText` があればそれを返す（優先）
2. なければ Supabase 上のテキスト URL から `getTextFromDocumentFile` で取得
3. いずれも不可なら「OCR テキストを取得できませんでした…」メッセージ

## 開発時の注意点

| 項目 | 内容 |
|------|------|
| 認証 | 一覧・スキャン・保存はすべて `protectedProcedure` |
| ペイロード | 大きな `imageDataUrl` は非推奨。クライアント側アップロード + URL 渡しを使う |
| カメラ UI | `step === "camera"` 中は `body[data-field-camera-active]` と `overflow: hidden` を設定 |
| OCR 失敗 | 領域未指定・認識テキスト空の場合は `trim` ステップへ戻る |
| 再抽出 | プレビューでテキスト編集後、`extractKGFromPlainText` を単独で再実行可能 |

## 関連ファイル

- `src/features/field/components/field-scan-flow.tsx` — メインフロー・ステップ管理
- `src/features/field/components/live-camera-scanner.tsx` — ライブカメラ UI
- `src/features/field/components/scan-region-selector.tsx` — ROI 編集
- `src/features/field/ocr/tesseract-client.ts` — OCR 実行
- `src/features/field/ocr/camera-capture.ts` — カメラストリーム・静止画化
- `src/features/field/ocr/region-types.ts` — 正規化座標・回転
- `src/features/field/components/graph-summary.tsx` — グラフ要約・一致候補・編集
- `src/server/api/routers/scan.ts` — tRPC ルーター
- `src/server/services/scan/create-from-scan.service.ts` — 保存ロジック
- `src/server/services/scan/search-user-node-matches.service.ts` — 一致検索
- `src/server/services/scan/normalize-ocr-text.service.ts` — LLM 整形
- `src/server/services/scan/resolve-scan-plain-text.ts` — 本文解決

グラフ統計パネルの指標定義は [graph-statistics-panel.md](./graph-statistics-panel.md) を参照。
