# Cursor エージェント向け GitHub Issue コマンド

`.cursor/commands/` に、Cloud Agent / Cursor チャットから GitHub Issue を扱うためのスラッシュコマンド定義がある。対象リポジトリは `MatsunoHitoshi/ArsTraverse`（ローカル名 `graph-viz-with-llm`）。

| コマンドファイル | 用途 |
|------------------|------|
| `issues.md` | オープン Issue 一覧（`gh issue list`） |
| `add-issue.md` | 新規 Issue 作成 |
| `implement-issue.md` | 指定番号の Issue 実装 |
| `close-issue.md` | Issue クローズ |

いずれも **リポジトリルートで `gh` を実行**し、`-R` は付けない（各ファイルの手順をそのまま使う）。

エージェント自動化で Issue 駆動開発をするときは、まず `issues.md` の手順で一覧を取得し、実装タスクは `implement-issue.md` を参照する。