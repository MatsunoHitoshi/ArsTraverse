# /issues コマンド

このリポジトリの GitHub Issue 一覧を表示する。

対象リポジトリは `graph-viz-with-llm`。`gh` はこのリポジトリのルートで実行し、`-R` は付けない。

## 手順

1. デフォルトはオープン中の Issue を表示する。

```bash
gh issue list --limit 30
```

2. ユーザーが `closed` や `all` を指定した場合は `--state` を付ける。

```bash
gh issue list --state closed --limit 30
gh issue list --state all --limit 30
```

3. 番号、タイトル、ラベル、URL が分かる形で見せる。次に `/implement-issue <番号>` で実装を始められることも一言添える。

## 例

ユーザー入力: `/issues`

→ オープン中の Issue 一覧を表示する。
