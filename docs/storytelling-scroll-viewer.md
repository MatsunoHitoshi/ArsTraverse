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

## 関連実装ファイル

- `src/app/_components/article/scroll-storytelling-viewer-unified.tsx` — 本ビュー本体
- `src/app/_components/d3/force/storytelling-graph-unified.tsx` — D3 側のフォーカス・アニメーション
- `src/app/_utils/story-scroll-utils.ts` — `buildScrollStepsFromMetaGraphStoryData` などステップ構築
