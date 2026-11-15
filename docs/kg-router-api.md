# kgRouter API 索引

`src/server/api/routers/kg.ts` は 3 モジュールを合成した tRPC ルーター `kg` である。

```6:9:src/server/api/routers/kg.ts
export const kgRouter = createTRPCRouter({
  ...extractionProcedures,
  ...integrationProcedures,
  ...copilotProcedures,
});
```

| モジュール | ファイル | 役割 |
|------------|----------|------|
| 抽出 | `kg-extraction.ts` | LLM によるグラフ抽出・Phase1/2・プレーンテキスト抽出 |
| 統合 | `kg-integration.ts` | TopicSpace への永続化マージ・近傍・ID 取得 |
| コパイロット | `kg-copilot.ts` | 執筆 Workspace のメタグラフ・ストーリー・コミュニティ・レイアウト支援 |

深いフローは各専用ドキュメントへ委譲する。本ページは **手続きの一覧と入口** だけを載せる。

## 抽出手続き（`kg-extraction.ts`）

認証はいずれも `publicProcedure`（セッション不要。UI・バッチ・MCP から呼ばれる）。

| tRPC | 説明 |
|------|------|
| `kg.extractPhase1` | イテレーティブ抽出 Phase1（ノード・関係の初回パス） |
| `kg.extractPhase2` | Phase2（Phase1 結果を入力に精緻化） |
| `kg.finalizeGraph` | 曖昧性解消・プロパティ翻訳・フロント形式への整形 |
| `kg.extractKG` | PDF / URL 等からの一括抽出（Extractor 切り替え） |
| `kg.extractKGFromPlainText` | プレーンテキスト抽出（フィールドスキャン・MCP と共有） |
| `kg.analyzeTextStructure` | テキスト構造解析（チャンク設計の補助） |
| `kg.convertToEdgeType` | 自然言語の関係ラベルをスキーマの edge type に変換 |
| `kg.textInspect` | テキスト検査ユーティリティ |

**関連ドキュメント**

- [KG バッチ抽出パイプライン](./kg-batched-extraction-pipeline.md) — Phase1/2 Cron・ドキュメントキュー
- [TopicSpace グラフ拡張](./topic-space-graph-extension.md) — UI からの `extractKG` / 統合
- [フィールドリサーチ](./field-research-scan-flow.md) — `extractKGFromPlainText` 経路

## 統合・参照手続き（`kg-integration.ts`）

| tRPC | 認証 | 説明 |
|------|------|------|
| `kg.integrateGraph` | 要 | TopicSpace 統合グラフへ fuse して永続化 |
| `kg.getNodesByIds` | 要 | ノード ID 指定のフロント形式取得 |
| `kg.getRelatedNodes` | 不要 | 1-hop 近傍部分グラフ |

詳細は [KG 統合・近傍取得 API](./kg-integration-api.md)。

## コパイロット手続き（`kg-copilot.ts`）

いずれも `protectedProcedure`（要ログイン）。

| tRPC | 説明 |
|------|------|
| `kg.askCopilot` | 執筆中グラフへの自然言語クエリ（ノード検索・提案） |
| `kg.analyzeGraphInsights` | グラフ構造のインサイト要約 |
| `kg.summarizeCommunities` | コミュニティ単位の要約 |
| `kg.generateMetaGraph` | 参照 TopicSpace からメタグラフ生成 |
| `kg.generateMetaGraphFromText` | Workspace 本文セクションからメタグラフ（内部で `integrateWorkspaceTextGraph`） |
| `kg.generateCommunityStory` | コミュニティ単位のナラティブ生成 |
| `kg.annotateStorySegments` | ストーリーセグメントへのノード・エッジ自動注釈 |
| `kg.regenerateNarrativeFlow` | ナラティブ順序の再生成 |
| `kg.classifyEdgeMotion` | エッジのモーション分類（可視化用） |

**関連ドキュメント**

- [テキストからストーリー生成](./story-generation-text-mode-flow.md) — `generateMetaGraphFromText` / `annotateStorySegments` のフロー
- [執筆ワークスペース API](./workspace-router-api.md) — Workspace 本文・`curatorialContext`

## REST・MCP との関係

| 経路 | kgRouter との対応 |
|------|-------------------|
| `POST /api/cron/kg-extraction` | サービス層から `runExtractKGFromPlainText`（抽出手続きと同ロジック） |
| TopicSpace MCP `/api/topic-spaces/{id}/mcp` | 統合・埋め込み検索は別ルート（[MCP 認証](./mcp-authentication.md)） |
| Workspace `textCompletionWithGraph`（deep） | MCP ツール経由でグラフコンテキスト取得（kgRouter とは別） |

## 関連ファイル

- `src/server/api/routers/kg.ts` — ルーター合成
- `src/server/api/routers/kg-extraction.ts`
- `src/server/api/routers/kg-integration.ts`
- `src/server/api/routers/kg-copilot.ts`
- `src/server/api/schemas/knowledge-graph.ts` — Zod 入力スキーマ