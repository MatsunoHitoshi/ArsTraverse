# /close-issue コマンド

ユーザーが指定した番号の GitHub Issue をクローズする。

対象リポジトリは `graph-viz-with-llm`。`gh` はこのリポジトリのルートで実行し、`-R` は付けない。

## 手順

1. ユーザー入力から Issue 番号 N を取り出す。番号が無い場合は確認して停止する。
2. `gh issue view N --json number,title,state,url` で対象を確認する。見つからなければ停止する。
3. 既にクローズ済みなら、その旨を伝えて終了する。
4. `gh issue close N` を実行する。
5. クローズ結果（番号、タイトル、URL）を表示する。

## 例

ユーザー入力: `/close-issue 13`

実行コマンド:

```bash
gh issue close 13
```
