# Vercel 本番ビルドとメモリ制約

ArsTraverse の `npm run build`（`next build`）は Vercel の **8 GB** ビルダー上で動く。型検査・ESLint・webpack が同一プロセス／ワーカー空間を争うため、OOM（`SIGKILL`）を避ける設定が `next.config.js` と `package.json` に入っている。

## 症状

Vercel のビルドログで次の段階のあとプロセスが落ちることがある。

- `Linting and checking validity of types ...`
- 長時間の webpack コンパイル直後の型チェック

原因は、型対応 ESLint（`parserOptions.project`）が **TypeScript プログラムを二重に** 立ち上げることと、`tsc` との同時実行によるピークメモリ。

## 設定の要点

| 場所 | 内容 |
|------|------|
| `package.json` `build` | `NODE_OPTIONS=--max-old-space-size=4096` で Node ヒープ上限を 4 GB に制限（残りを OS・子プロセス用に残す） |
| `next.config.js` `eslint.ignoreDuringBuilds` | **`true`** — 本番ビルドから ESLint を除外 |
| `next.config.js` `experimental.webpackBuildWorker` | `true` — カスタム webpack 使用時もビルドワーカーを有効にし、コンパイルヒープを親から分離 |
| `next.config.js` `experimental.webpackMemoryOptimizations` | `true` — Next 側のメモリ最適化 |

```10:10:package.json
    "build": "NODE_OPTIONS=\"${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=4096\" next build",
```

```18:27:next.config.js
  eslint: {
    // `next build` runs type-aware ESLint and `tsc` at the same time, after
    // webpack. ESLint here uses `parserOptions.project`, so that is a second
    // full TypeScript program. On the 8 GB Vercel builder that pair is what
    // gets SIGKILL during "Linting and checking validity of types".
    // `npm run lint` still runs the same checks outside the production build.
    // The build script also caps each Node process at 4096 MB so the
    // remaining `tsc` worker cannot grow until the 8 GB builder is killed.
    ignoreDuringBuilds: true,
  },
```

## 開発者向け運用

| コマンド | 役割 |
|----------|------|
| `npm run build` | 本番相当ビルド（ESLint はスキップ、型チェックは実行） |
| `npm run lint` | 型対応 ESLint（CI やローカルで **ビルド前** に実行する想定） |

**CI の推奨**: `npm run lint` と `npm run build` を別ステップに分ける。ビルドステップだけに ESLint を期待しない。

ローカルで 8 GB 未満のマシンでも `build` が落ちる場合は、同じ `NODE_OPTIONS` が `package.json` に入っているか確認する。

## サーバー用パッケージのトレース除外

`outputFileTracingExcludes` で `/api/cron/kg-extraction` から ONNX・PDF・OCR 系の `node_modules` を File Tracing から外し、サーバーレス関数のデプロイサイズを抑える（ビルドメモリとは別目的だが本番ビルドパイプラインの一部）。

## 関連ファイル

- `next.config.js` — ESLint スキップ・webpack 実験フラグ・tracing 除外
- `package.json` — `build` / `lint` スクリプト
- `.github/workflows/` — リント・ビルドの CI ステップ（存在すれば `lint` → `build` 順を確認）

## 関連ドキュメント

- [KG バッチ抽出パイプライン](./kg-batched-extraction-pipeline.md) — `kg-extraction` Cron と重い依存関係