# メタグラフ戦略の比較実験ガイド

テキストモードで「章（セクション）＝コミュニティ」を決める **2層パイプライン**について、第1層（トポロジ／意味クラスタ）と第2層（セクションへの写像）の組み合わせを比較評価するための手順と前提をまとめる。

## 1. 比較対象の整理

### 1.1 第1層: `clusterStrategy`

| ID | 概要 | 主な入力 |
|----|------|-----------|
| `louvain-unweighted` | 無向・等重みの Louvain（現行デフォルト） | グラフのノード・リレーションのみ |
| `leiden-unweighted` | 無向・等重みの Leiden（`ngraph.leiden`） | 同上 + `clusterOptions.randomSeed`（未指定時は実装側デフォルト） |
| `embedding-kmeans-name` | ノード名の `nameEmbedding` 上で k-means | `GraphNode.nameEmbedding` が揃った TopicSpace + 同一グラフのノード ID |
| `label-propagation-seeded` | セクションの entityNames から作るシードでラベル伝播 | `sections`（本文パース結果） |

定義: `src/server/lib/meta-graph-strategies/types.ts` の `CLUSTER_STRATEGY_IDS`、実装レジストリは `cluster-strategies.ts`。

### 1.2 第2層: `sectionMapStrategy`

| ID | 概要 | 主な入力 |
|----|------|-----------|
| `seed-max-count` | 各数値クラスタを、セクションシード（entityNames→ノード名一致）との重なり数最大の `text-{i}` に割当（デフォルト） | `sections` + 第1層の `labelToNodeIds` |
| `hybrid-seed-embedding` | シード強度とセクション／クラスタ centroid のコサイン類似を重み付け（実装は `kg-copilot` 内で重み・閾値固定） | 上記 + `nameEmbedding` + セクション埋め込み（MiniLM 系） |

## 2. API での指定方法

比較は **`kgCopilot.generateMetaGraphFromText`** の入力 `metaGraphStrategies` で行う。

```ts
metaGraphStrategies: {
  clusterStrategy: "leiden-unweighted", // 省略時は louvain-unweighted
  sectionMapStrategy: "hybrid-seed-embedding", // 省略時は seed-max-count
  clusterOptions: {
    maxK: 12, // embedding-kmeans-name の k 上限など
    labelPropagationIterations: 30,
    randomSeed: 42,
  },
},
```

- `clusterOptions` は戦略ごとに使われるフィールドが異なる（未使用フィールドは無視される）。
- クライアントからは `useMetaGraphStory` 経由で同じ mutation に渡す想定。

## 3. 前提条件とフォールバック

実装は `src/server/api/routers/kg-copilot.ts` の `generateMetaGraphFromText` 内。

| 条件 | 挙動 |
|------|------|
| `embedding-kmeans-name` だが TopicSpace 解決不可 | `louvain-unweighted` にフォールバック（警告ログ） |
| `embedding-kmeans-name` だが埋め込み 0 件／読み込み失敗 | 同上 |
| `hybrid-seed-embedding` だが TopicSpace 解決不可 | `seed-max-count` にフォールバック |
| `hybrid-seed-embedding` だが埋め込み取得・セクション埋め込み失敗 | 同上 |

比較実験では **フォールバックに入った run は同一条件の比較から除外**するか、ログで必ず検知すること。

### 3.1 TopicSpace と `nameEmbedding`

- `resolveTopicSpaceIdForMetaGraph`（`resolve-topic-space-id.ts`）で `topicSpaceId` を解決する。入力で `topicSpaceId` を明示できる。
- `loadNodeNameEmbeddingsForTopicSpace`（`load-node-name-embeddings.ts`）が `GraphNode.nameEmbedding` を読む。`embedding-kmeans-name` および `hybrid-seed-embedding` のノード側で必要。

### 3.2 ハイブリッド写像の固定パラメータ（現状）

`kg-copilot.ts` 内で `HybridSectionMappingContext` が次のように組み立てられる（コード変更なしの実験では事実上固定）。

- `weights`: `{ seed: 0.45, semantic: 0.55 }`
- `semanticThreshold`: `1e-3`

重みや閾値の比較をする場合は、実装を分岐させるか設定化する必要がある（本ドキュメントは現状の挙動の記録）。

## 4. 推奨する実験デザイン

### 4.1 固定すべきもの

- 同一 `graphDocument`（同一 `workspaceId` で本文統合した後のグラフが望ましい場合は統合パスも固定）。
- 同一 `workspaceContent`（Tiptap の `content` 配列）→ `extractSectionsWithSegments` の結果が一致する。
- `minCommunitySize`（メタノード化の閾値）。
- Leiden 比較時は `clusterOptions.randomSeed` を固定し、複数 seed で分散を見るならその旨を記録。

### 4.2 掃引しやすい軸

1. **第1層のみ変える**（第2層は `seed-max-count` に固定）  
   → トポロジ／意味／シード LP の違いが `labelToNodeIds` と `text-{i}` 割当に与える影響。
2. **第2層のみ変える**（第1層は Louvain に固定）  
   → 同一クラスタ分割のまま、シード最大 vs ハイブリッドの写像差。
3. **全組み合わせ**（4×2＝8通り）  
   埋め込み前提の 4 通りは TopicSpace / `nameEmbedding` の整備が必須。

### 4.3 記録すべきアウトプット

mutation の戻り値から、少なくとも次を保存すると再現・比較しやすい。

- `metaNodes` / `metaGraph`（メタ層の構造）
- `communityMap`（元ノード ID → コミュニティ ID）
- `narrativeFlow`（章の順序と遷移文）
- `summaries` / `preparedCommunities`
- `detailedStories`（章ごとのストーリー本文・セグメント attrs）

**効果指標の例**（プロダクト都合で定義する）:

- 章あたりのメタノード数、外部接続の有無（`hasExternalConnections`）
- セグメント attrs の `segmentNodeIds` / `segmentEdgeIds` の付与率（後段 `runAnnotateStorySegments` の結果とセットで評価する場合）
- 人手評価: 章見出しとサマリの一致度、グラフ上の話の一貫性

## 5. 実装参照一覧

| 内容 | パス |
|------|------|
| 戦略 ID・入力型 | `src/server/lib/meta-graph-strategies/types.ts` |
| 第1層ディスパッチ | `src/server/lib/meta-graph-strategies/cluster-strategies.ts` |
| コミュニティ割当全体 | `src/server/lib/meta-graph-strategies/run-community-assignment.ts` |
| Louvain | `cluster-louvain-unweighted.ts` |
| Leiden | `cluster-leiden-unweighted.ts` |
| k-means（名前埋め込み） | `cluster-embedding-kmeans-name.ts` |
| シード LP | `cluster-label-propagation-seeded.ts` |
| シード最大写像 | `section-map-seed-max.ts` |
| ハイブリッド写像 | `section-map-hybrid-embedding.ts` |
| TRPC 入力・埋め込み・フォールバック | `src/server/api/routers/kg-copilot.ts`（`generateMetaGraphFromText`） |
| 処理フロー概観 | `docs/story-generation-text-mode-flow.md` |
| community 層ベンチ CLI・比較 | `scripts/meta-graph-strategy-benchmark.ts`、`experiment/compare-community-assignments.ts` |

## 6. チェックリスト（1 run あたり）

- [ ] `metaGraphStrategies` の JSON をログまたは実験ノートに保存した
- [ ] `workspaceId` / `topicSpaceId` / 統合の有無を記録した
- [ ] 埋め込み依存戦略の場合、フォールバックログが出ていないことを確認した
- [ ] 同一入力で複数回回す戦略では `randomSeed` を記録した
- [ ] 返却 JSON の主要フィールドをバージョン管理外の成果物フォルダ等に保存した

## 7. 自動化（community 層のみ）

`generateMetaGraphFromText` や LLM 注釈は使わず、[`runCommunityAssignment`](../src/server/lib/meta-graph-strategies/run-community-assignment.ts) だけを JSON フィクスチャから一括実行し、ノード単位のコミュニティ ID 一致率などを集計する。

### 7.1 フィクスチャ

- 形式は [`experiments/fixtures/README.md`](../experiments/fixtures/README.md) を参照。
- サンプル: [`experiments/fixtures/smoke/input.json`](../experiments/fixtures/smoke/input.json)

### 7.2 実行

```bash
npm run experiment:meta-graph -- --fixture experiments/fixtures/smoke
```

- 省略時は第1層 4 種 × 第2層 2 種の全組み合わせを試行する。
- `embedding-kmeans-name` または `hybrid-seed-embedding` に必要な埋め込みがフィクスチャに無い組み合わせは **スキップ**（標準エラーに理由を出す）。
- 全組み合わせを必ず成功させたい場合はフィクスチャに `nodeNameEmbeddings` と（ハイブリッド用）`hybridContext.sectionEmbeddingVectors` を揃える。
- スキップを許容しない場合は `--require-embeddings` を付ける（最初のスキップで非ゼロ終了）。

その他の主なオプション:

| オプション | 説明 |
|------------|------|
| `--strategies` | カンマ区切りで `clusterStrategy/sectionMapStrategy`（例: `louvain-unweighted/seed-max-count,leiden-unweighted/seed-max-count`） |
| `--baseline` | 一致率の基準となる組み合わせ（デフォルト: `louvain-unweighted/seed-max-count`） |
| `--out` | 出力ディレクトリ（省略時は `experiments/out/run-<タイムスタンプ>`） |

### 7.3 成果物

各戦略の `CommunityAssignmentResult` を JSON 化したファイル、`summary.csv` / `summary.md`（基準戦略との **ノード単位 communityId 完全一致率** など）、`meta.json`（スキップ一覧など）が `--out` 先に出力される。`experiments/out/` は `.gitignore` 済み。

### 7.4 実装参照

| 内容 | パス |
|------|------|
| 割当の比較・シリアライズ | `src/server/lib/meta-graph-strategies/experiment/compare-community-assignments.ts` |
| CLI | `scripts/meta-graph-strategy-benchmark.ts` |

---

*本ドキュメントは実装に追随する。戦略追加・`hybrid` のパラメータ外部化を行ったら、対応する節を更新すること。*
