# 公開記事のスクロールストーリーテリングと URL

公開ワークスペース記事（`/articles/[workspaceId]`）で、メタグラフのナラティブがある場合に表示されるスクロール連動ビューと、ワークスペース側のストーリーテリング URL の要点。

## いつどのビューが出るか

- データ取得: `api.workspace.getPublishedWithStory`（`src/app/articles/[workspaceId]/page.tsx`）。
- **スクロールストーリーテリング**（グラフ＋スクロール）の条件: `metaGraphData` が存在し、`metaGraphData.narrativeFlow` が空でない配列であること。
- 上記を満たさず、参照トピックスペースも無い場合はエラー（「参照されているリポジトリがありません」）。
- ナラティブが無いが `referencedTopicSpaces[0]` がある場合は従来の `PublicArticleViewer`（本文＋グラフ）。

## グラフ実装の切り替え（公開記事）

| クエリ | 挙動 |
|--------|------|
| （未指定・デフォルト） | `ScrollStorytellingViewerUnified`（D3 統合グラフ） |
| `?graph=legacy` | `ScrollStorytellingViewer`（従来の `StorytellingGraph`） |

コード: `searchParams.get("graph") !== "legacy"` が unified の条件。

## セクションへのディープリンク（公開・Unified）

- **`?community=<communityId>`** または **`?section=<communityId>`**（どちらも同じ意味で解釈される）。
- マウント後およそ **1 秒**で該当コミュニティの**先頭セグメント**へスクロールジャンプする（`setTimeout(..., 1000)`）。
- ジャンプ時は **deep link ロック**（約 2 秒）により、Scrollama が意図したステップより 1 つ先に進む誤判定を抑制する。
- セクションリンクのコピー UI は `community` クエリ付きの絶対 URL をクリップボードに書き込む（`pathname` ベース）。

主実装: `src/app/_components/article/scroll-storytelling-viewer-unified.tsx`。

## ワークスペース（執筆 UI）のストーリーテリング

- **`?storytelling=1`**: ストーリーテリングモード ON。初期状態と URL 同期で復元する。ON のときメタグラフモードも ON に揃える。
- **`?entityId=<id>`**: フォーカス中エンティティ（グラフ選択）を URL と同期。

主実装: `src/app/_components/curators-writing-workspace/curators-writing-workspace.tsx`。

## 関連コンポーネント（参照用）

- 公開 Unified: `scroll-storytelling-viewer-unified.tsx` → `StorytellingGraphUnified`
- 公開 Legacy: `scroll-storytelling-viewer.tsx` → `StorytellingGraph`
- 執筆ワークスペース: `curators-writing-workspace.tsx`、`snapshot-storyboard.tsx`、`storytelling-graph-recorder.tsx`
- テキストからストーリー構造・ナラティブ生成の流れ: [story-generation-text-mode-flow.md](./story-generation-text-mode-flow.md)

## 開発時の注意

- Unified ビューでは `DEBUG_STORY_SCROLL_UNIFIED` が `true` のとき、コンソールに `[StoryScrollUnified]` ログが出る。挙動確認・不具合調査に利用する。
- SP ではスクロール位置と Scrollama のオフセット（0.99）の兼ね合いで、意図的にスクロールスナップの一時解除やオフセット調整が入っている。レイアウト変更時はステップ境界の誤発火に注意する。
