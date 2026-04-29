# メタグラフ戦略ベンチ用フィクスチャ

[`scripts/meta-graph-strategy-benchmark.ts`](../../scripts/meta-graph-strategy-benchmark.ts) が読み込む `input.json` の形式。

## `input.json` スキーマ

| フィールド | 必須 | 説明 |
|------------|------|------|
| `graphDocument` | はい | [`MetaGraphGraphDoc`](../../src/server/lib/meta-graph-strategies/types.ts) 互換（`nodes` / `relationships`） |
| `sections` | はい | [`ClusterStrategySection`](../../src/server/lib/meta-graph-strategies/types.ts) の配列 |
| `nodeNameEmbeddings` | 条件付き | `embedding-kmeans-name` または `hybrid-seed-embedding` で必要。ノード ID → 埋め込みベクトル（JSON オブジェクト） |
| `hybridContext` | 条件付き | `hybrid-seed-embedding` で必要。`sectionEmbeddingVectors`（セクション数と同じ行数）、任意で `weights` / `semanticThreshold` |
| `clusterOptions` | いいえ | `maxK` / `labelPropagationIterations` / `randomSeed`（`metaGraphStrategies.clusterOptions` に相当） |

`hybrid-seed-embedding` では `HybridSectionMappingContext.nodeNameEmbeddings` にトップレベルの `nodeNameEmbeddings` を流用する。

## ワークスペース JSON から生成する

アプリからエクスポートした `workspace.json`（`content` と `referencedTopicSpaces[].graphNodes` / `graphRelationships` を含む）から `input.json` を作れる。

```bash
npm run experiment:build-fixture -- --in experiments/fixtures/first/workspace.json --out experiments/fixtures/first/input.json
```

- 既定では `referencedTopicSpaces[0]` のグラフを使う。別のトピック空間は `--topic-space-index 1` などで指定。
- `extractSectionsWithSegments` と同じ規則で、`workspace.content` から見出し2（H2）単位の `sections` を生成する（H2 が無いとエラー）。
- `nodeNameEmbeddings` / `hybridContext` は含めない。埋め込みが要る戦略は DB からエクスポートしたベクトルを追記するか、別ツールで付与する。

任意のメタデータとして `_meta`（件数・topicSpaceId など）が先頭に付く。ベンチ CLI は `_meta` を無視する。

## ディレクトリ例

```
experiments/fixtures/smoke/input.json
experiments/fixtures/first/input.json   # workspace 由来の例
```

## ベンチ実行記録

以下はリポジトリ上で `npm run experiment:meta-graph` を実行した結果の記録である。基準戦略はいずれも `louvain-unweighted/seed-max-count`。一致率は **ノードごとの `communityId` 文字列が基準と一致した割合**（`summary.md` と同じ）。

### 2026-04-19（ローカル）

**A. スモーク（全 8 組み合わせ）**

コマンド:

```bash
npm run experiment:meta-graph -- --fixture experiments/fixtures/smoke
```

フィクスチャ: `experiments/fixtures/smoke/input.json`（3 ノード・2 リレーション・2 セクション、埋め込みあり）。スキップなし。

| strategy | agreement | compared nodes | distinct communities (this run) |
|----------|------------|----------------|----------------------------------|
| louvain-unweighted__seed-max-count | 100.00% | 3 | 1 |
| louvain-unweighted__hybrid-seed-embedding | 66.67% | 3 | 2 |
| leiden-unweighted__seed-max-count | 100.00% | 3 | 1 |
| leiden-unweighted__hybrid-seed-embedding | 100.00% | 3 | 1 |
| embedding-kmeans-name__seed-max-count | 66.67% | 3 | 2 |
| embedding-kmeans-name__hybrid-seed-embedding | 66.67% | 3 | 2 |
| label-propagation-seeded__seed-max-count | 100.00% | 3 | 1 |
| label-propagation-seeded__hybrid-seed-embedding | 100.00% | 3 | 1 |

成果物ディレクトリ例: `experiments/out/run-2026-04-19T04-47-56-148Z`（再実行ごとにタイムスタンプ付きで別フォルダになる）。

---

**B. workspace 由来 `first`（埋め込み不要の第1層のみ）**

`first/input.json` には `nodeNameEmbeddings` が無いため、Louvain / Leiden / シード LP と `seed-max-count` の 3 通りのみ実行した。

コマンド:

```bash
npm run experiment:meta-graph -- --fixture experiments/fixtures/first \
  --strategies "louvain-unweighted/seed-max-count,leiden-unweighted/seed-max-count,label-propagation-seeded/seed-max-count"
```

入力規模（`input.json` の `_meta`）: 500 ノード、745 リレーション、4 セクション。

| strategy | agreement | compared nodes | distinct communities (this run) |
|----------|------------|----------------|----------------------------------|
| louvain-unweighted__seed-max-count | 100.00% | 500 | 59 |
| leiden-unweighted__seed-max-count | 6.60% | 500 | 143 |
| label-propagation-seeded__seed-max-count | 38.60% | 500 | 88 |

成果物ディレクトリ例: `experiments/out/run-2026-04-19T04-48-03-318Z`。

※ Leiden / LP は第1層の数値クラスタが Louvain と異なるため、第2層の `text-{i}` 割当も変わり、基準との一致率は低く出やすい。

### `first` の追加分析（章コミュニティ `text-*` への載せ方）

基準 Louvain との**一致率だけ**では第1層の良し悪しは決めにくい（第1層が違えば第2層の `seed-max-count` 結果も変わるため）。**最終 `communityId` が `text-{i}`（H2 に対応する章コミュニティ）か、`louvain-*`（シードと十分重ならなかったクラスタの寄せ先）か**を数えると、目的に沿った比較がしやすい。

同一成果物（`experiments/out/run-2026-04-19T04-48-03-318Z`）の `result.nodeToCommunity` を集計した値:

| 第1層 | `text-*` に割り当たったノード数 | `louvain-*` | `text-*` の割合 |
|--------|----------------------------------|-------------|-----------------|
| Louvain | 238 | 262 | 47.6% |
| Leiden | 43 | 457 | 8.6% |
| シード LP | 415 | 85 | 83.0% |

章ごとの内訳（`text-*` のみ）:

| 第1層 | text-0 | text-1 | text-2 | text-3 |
|--------|--------|--------|--------|--------|
| Louvain | 171 | 0 | 18 | 49 |
| Leiden | 28 | 0 | 11 | 4 |
| シード LP | 358 | 0 | 53 | 4 |

**解釈の例**

- **本文の章（H2）とコミュニティを揃えたい**目的では、このデータでは **シード付きラベル伝播 + seed-max** が、最も多くのノードを `text-*` に載せている。
- **トポロジとしての自然なクラスタ**を優先するなら Louvain を基準にし、章への強制は弱め（約半数が `louvain-*`）。
- **Leiden** はこの入力では `text-*` が極端に少なく、**章対応を主目的にする選択肢としては不利**に見える（別グラフや `randomSeed` では変わり得る）。

**注意**

- 3 戦略とも **`text-1` は 0 ノード**（どの第1層クラスタも第2層でセクション 1 に割り当てられなかった）。4 章すべてに必ず人を割りたい場合は、別指標が必要。
- シード LP は **`text-0` への偏り**が大きい（358/415）。章間バランスまで重視する場合は追加の評価や別戦略の検討が必要。

**まとめ**: 執筆上の章とコミュニティの対応を重視するなら **label-propagation-seeded + seed-max-count** がこの実験では最もその意図に沿う。トポロジ重視は **Louvain**、Leiden はクラスタ品質など別目的で評価するのがよい。
