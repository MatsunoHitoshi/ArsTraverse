# kgRouter 手続き一覧（抽出・統合・コパイロット）

`tRPC` の `kg` 名前空間は、実装を 3 ファイルに分けつつ **1 ルーター** にマージしている。

```text
src/server/api/routers/kg.ts
  ├── kg-extraction.ts   … 公開抽出手続き（publicProcedure）
  ├── kg-integration.ts  … TopicSpace / DocumentGraph 統合・近傍
  └── kg-copilot.ts      … 執筆・ストーリー支援（protectedProcedure）
```

クライアントからはすべて `trpc.kg.*` で呼ぶ。詳細フローは各リンク先ドキュメントを参照する。

## 統合・近傍（integrationProcedures）

| 手続き | 認証 | 説明 |
|--------|------|------|
| `kg.integrateGraph` | 要 | TopicSpace 統合グラフへ fuse + 永続化 |
| `kg.getNodesByIds` | 要 | ID 指定ノードのフロント形式取得 |
| `kg.getRelatedNodes` | 不要 | 1-hop 近傍 + ソースリンクの部分グラフ |

→ [KG 統合・近傍取得 API](./kg-integration-api.md)

## 抽出（extractionProcedures）

いずれも **publicProcedure**（セッション不要）。本番 UI では TopicSpace 管理者フローから呼ばれることが多い。

| 手続き | 用途 |
|--------|------|
| `kg.extractKG` | ファイル URL からの KG 抽出（レガシー／Assistants 経路あり） |
| `kg.extractKGFromPlainText` | プレーンテキストからの抽出（Workspace・TopicSpace 拡張で常用） |
| `kg.extractPhase1` / `kg.extractPhase2` | バッチ Phase1（構造）／Phase2（関係） |
| `kg.finalizeGraph` | 抽出結果の正規化・フロント形式への整形 |
| `kg.analyzeTextStructure` | テキスト構造分析（チャンク・見出し等） |
| `kg.convertToEdgeType` | 自然言語の関係表現 → スキーマ上の edge type |
| `kg.textInspect` | デバッグ用テキスト検査 |

→ 非同期ジョブ・モデル設定: [KG バッチ抽出パイプライン](./kg-batched-extraction-pipeline.md)  
→ TopicSpace UI からの `integrateGraph` まで: [TopicSpace グラフ拡張](./topic-space-graph-extension.md)  
→ テキストモードのメタグラフ: [テキストからストーリー生成](./story-generation-text-mode-flow.md)

## コパイロット（copilotProcedures）

いずれも **protectedProcedure**（ログイン必須）。グラフ構造分析・コミュニティ要約・メタグラフ生成・ナラティブ再生成など。

| 手続き | 用途 |
|--------|------|
| `kg.askCopilot` | グラフ＋執筆文脈への質問（ストリーミング応答） |
| `kg.analyzeGraphInsights` | グラフ全体の洞察サマリ |
| `kg.summarizeCommunities` | Louvain コミュニティの要約 |
| `kg.generateMetaGraph` | 既存グラフからメタグラフ（ストーリー骨格） |
| `kg.generateMetaGraphFromText` | TipTap 本文セクションからメタグラフ |
| `kg.generateCommunityStory` | コミュニティ単位の叙述生成 |
| `kg.annotateStorySegments` | ストーリーセグメントとノード／エッジの対応付け |
| `kg.regenerateNarrativeFlow` | ナラティブフロー再生成 |
| `kg.classifyEdgeMotion` | エッジの「動き」分類（演出・ストーリー向け） |

内部で `source-document`・`topic-space` の attach/detach や `runExtractKGFromPlainText` を再利用する手続きがある。入力スキーマは `src/server/api/schemas/knowledge-graph.ts`。

## 関連ルーター（`kg` 以外）

| 名前空間 | 主な手続き | ドキュメント |
|----------|------------|--------------|
| `story` | `upsert`, `get`, `delete`, `checkConsistency` | [ストーリーテリング公開ビュー](./storytelling-public-viewer-and-urls.md) |
| `scan` | `createFromScan`, `listSessions`, `normalizeOcrText`, `searchNodeMatchesByNames` | [フィールドリサーチスキャン](./field-research-scan-flow.md) |
| `googleDrive` | `getConnectionStatus`, `disconnect`, `getPickerConfig` | [TopicSpace Drive 同期](./topic-space-drive-sync.md) |

外部 REST の Drive 画像 API（SOS 連携）は [外部 Workspace REST API](./external-workspace-api.md#google-drive外部-api) を参照。

## 関連ファイル

- `src/server/api/root.ts` — `kg: kgRouter` 登録
- `src/server/api/routers/kg.ts` — 3 モジュールの spread マージ
- `src/server/api/routers/kg-extraction.ts`
- `src/server/api/routers/kg-integration.ts`
- `src/server/api/routers/kg-copilot.ts`
