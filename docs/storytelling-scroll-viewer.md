# 公開記事：スクロール連動ストーリーテリング（Unified）

スクロールに合わせてグラフのフォーカスが切り替わる「ストーリーテリング」公開ビュー。データは `MetaGraphStoryData`（`narrativeFlow` など）と公開ワークスペースの `graphDocument` を前提とする。

## どこで使われるか

| 項目 | 内容 |
|------|------|
| ルート | `src/app/articles/[workspaceId]/page.tsx` |
| コンポーネント | `ScrollStorytellingViewerUnified`（`scroll-storytelling-viewer-unified.tsx`） |
| 表示条件 | `metaGraphData` が存在し、`narrativeFlow` が空でない配列であること |
| 従来ビュー | 同一ページでクエリ `?graph=legacy` のとき `ScrollStorytellingViewer` を表示 |

ストーリーデータの生成パイプラインは [story-generation-text-mode-flow.md](./story-generation-text-mode-flow.md) を参照。

## URL クエリ（ディープリンク・共有）

| クエリ | 役割 |
|--------|------|
| `community=<communityId>` | ロード後（約 1 秒の遅延のあと）、該当コミュニティの**先頭セグメント**へスクロールし、グラフをその章から開始する |
| `section=<communityId>` | `community` と同義の別名（読み込み時・`useSearchParams` の両方で解釈） |
| `graph=legacy` | Unified ではなくレガシーの `ScrollStorytellingViewer` を使う |

リンクのコピー UI は現在の `pathname` に `?community=…` を付与する（`communityId` が空のときはクエリなしのベース URL）。

## スクロール・レイアウトの要点

- **Scrollama** の `offset` は `SCROLLAMA_OFFSET = 0.99`（段落がビューポート下端付近に入ったタイミングでステップ切替）。
- `document.documentElement` に **`scroll-snap-type: y mandatory`** を設定し、各ステップは `snap-start` + `[scroll-snap-stop:always]`。
- **ステップ 0** は synthetic な `__overview__`（グラフ全体）。`StorytellingGraphUnified` では `showFullGraph` がこのとき true。
- PC / SP でグラフ高・ステップのビューポート高・レイアウトが分岐（ブレークポイント `XL_BREAKPOINT = 1280px`）。グラフ枠の高さは PC が `min(95vh, 800px)`、SP が `min(72vh, 600px)`（定数 `GRAPH_SECTION_HEIGHT_*`）。ステップ枠は SP `65vh` / PC `100vh`（`STEP_VIEWPORT_HEIGHT_*`）。
- **SP のディープリンク（`goToFirstSegmentOfCommunity`）**: `block:start` 相当の位置だと Scrollama が隣ステップを拾いやすいため、スクロール先をビューポート高の **約 22% 分だけ上**にオフセットする。あわせてジャンプ中は `scroll-snap-type` を一時的に `none` にし、**約 450ms 後**に元の `y mandatory` に戻す。

## 安定化ロジック（デバッグ時の手掛かり）

意図しないステップ飛び（慣性スクロール、初回ディープリンク、境界の往復）を抑えるため、以下のガードが入っている。

| 機構 | ざっくりした役割（ソース定数） |
|------|------------------|
| **Deep link lock** | `goToFirstSegmentOfCommunity` 実行時、対象ステップ index を `INITIAL_DEEP_LINK_LOCK_MS`（**2000ms**）ロックし、その間は**より大きい index** への `onStepEnter` / `onStepProgress` を無視。ロック対象ステップに入るとロックは解除される |
| **初回 N+1 補正** | `?community=` 初回ジャンプで Scrollama が `enteredIndex === target + 1` と誤判定した場合、`initialScrollTargetIndexRef` の `target` に補正 |
| **First segment lock** | オーバービュー（0）から第 1 セグメント（1）に入った直後、`FIRST_SEGMENT_LOCK_MS`（**2500ms**＝`SEGMENT_ANIMATION_DELAY_MS` 500 + `SEGMENT_ANIMATION_DURATION_MS` 2000）以内は index ≥ 2 への進入を無視 |
| **Bounce guard** | 短時間で前ステップへ戻るノイズを `STEP_BOUNCE_GUARD_MS`（**320ms**）で無視 |
| **Top sentinel** | ページ最上部の小さな sentinel + `IntersectionObserver`。ヘッダー変化などで誤って「先頭にいる」と判定しないよう `scrollY < 100` のときだけ overview（index 0）扱い |

コンソールには `DEBUG_STORY_SCROLL_UNIFIED` が true のとき `[StoryScrollUnified]…` ログが出る（本ファイル作成時点のソースでは定数が `true`。**本番ノイズを避ける場合は false に変更**する運用を想定）。

## 自由探索モード

グラフ上のコントロールから切替。有効時は `frozenGraphIndexRef` で**当時のセグメント index** にグラフ表示を固定し、`StorytellingGraphUnified` に `freeExploreMode` を渡す。

## ステップ構築とレイアウト用フォーカスエッジ

スクロール各ステップの `nodeIds` / `edgeIds` と、D3 の**初回** force レイアウトで強めるリンク集合は別物。前者は現在セグメントの**描画フォーカス**、後者は全セグメントを踏まえた**レイアウト安定化用の union**（セグメント切替ではシミュレーションを回し直さない設計）。

### `buildScrollStepsFromMetaGraphStoryData`（`story-scroll-utils.ts`）

- `narrativeFlow` を `order` でソートし、各コミュニティの `detailedStories` 内の Tiptap **paragraph** を 1 ステップにする。
- 段落の attrs から `segmentNodeIds` / `segmentEdgeIds` を読む（空ならそのステップはコミュニティ全体フォーカス相当の「ノード・エッジ未指定」）。
- `detailedStories` が欠ける・文字列のみ・段落が無い場合はサマリー等でフォールバック 1 ステップ。
- トランジション専用ステップの追加ロジックはソース上コメントアウト済み（独立 `isTransition` ステップは現状出さない）。

### エッジ ID の表現（複合キー）

`internalEdgesDetailed` 等に安定したエッジ `id` が無い前提のため、リンクは **`sourceId|targetId|type`** の文字列で同一視する（`getEdgeCompositeKeyFromLink` / `story-segment.ts`）。`segmentEdgeIds` もこの形式を想定する。

### `resolveScrollStepGraphFocus`

- 引数 `step` は `ScrollStepGraphFocus`（`id`, `communityId`, `nodeIds`, `edgeIds` のみ必須）で足りる。
- `step.id === "__overview__"` のときは `{ nodeIds: [], edgeIds: [] }` を返す（オーバービューはレイアウト union からも除外される）。
- **`nodeIds` と `edgeIds` がどちらも空**で `communityMap` が渡されているとき、その `communityId` に属する全ノード ID に展開し、**両端点がその集合に含まれる**関係だけを `edgeIds` に含める（コミュニティ内サブグラフ）。

### `getLayoutFocusEdgeIdsFromScrollSteps` / `getLayoutFocusEdgeIdsFromMetaGraphStoryData`

- 全ステップ（`__overview__` を除く）について `resolveScrollStepGraphFocus` でノード・明示エッジを求める。
- 各ステップで、明示 `edgeIds` に含まれるリンクの端点をフォーカスノード集合にマージしたうえで、**フォーカス集合内の両端点を結ぶ全リンク**の複合キーを集合に追加する（`addIntraFocusEdgesForStep`）。ノードだけ指定された段落でも、ステップ内サブグラフの辺がレイアウト対象に入る。
- 返り値は全ステップの**和集合**（重複は `Set` で除去）。`getLayoutFocusEdgeIdsFromMetaGraphStoryData` は `buildScrollStepsFromMetaGraphStoryData` の結果に対して同じ union をかける。

### `StorytellingGraphUnified` との接続

- 親（`scroll-storytelling-viewer-unified.tsx` / `storytelling-graph-recorder.tsx`）が `getLayoutFocusEdgeIdsFromScrollSteps(steps, graphDocument.relationships, metaGraphData.communityMap)` を `layoutFocusEdgeIds` として渡す。
- グラフ側では `layoutFocusEdgeIdSet` に含まれるリンクだけ `forceLink` の **distance** を `LINK_DISTANCE * 0.8`、**strength** を `0.5`（通常 `0.3`）に寄せる（`isLayoutFocusLinkForForce`）。意図は初回配置でストーリー上重要な辺をやや短く強く結び、セグメントを変えても**同じシミュレーション結果座標を使い回す**こと（`useEffect` の依存に `layoutFocusEdgeIdsKey` は入るが、描画フォーカスの `focusEdgeIdSet` や `height` は意図的に含めない）。

### 検証用テスト

- `e2e/kg/story-scroll-layout-focus.unit.spec.ts` — コミュニティのみステップの展開、複数ステップにまたがる辺の union、`__overview__` の除外。

## 関連実装ファイル

- `src/app/_components/article/scroll-storytelling-viewer-unified.tsx` — 本ビュー本体
- `src/app/_components/d3/force/storytelling-graph-unified.tsx` — D3 側のフォーカス・アニメーション
- `src/app/_components/d3/force/storytelling-graph-recorder.tsx` — 録画時も同じ `layoutFocusEdgeIds` を渡す経路
- `src/app/_utils/story-scroll-utils.ts` — `buildScrollStepsFromMetaGraphStoryData` などステップ構築
- `src/app/const/story-segment.ts` — エッジ複合キー `getEdgeCompositeKeyFromLink`
- `e2e/kg/story-scroll-layout-focus.unit.spec.ts` — レイアウト union のユニットテスト
