# Vercel 本番ビルド（メモリと Lint）

Vercel のビルダーは **8 GB** のメモリ上限がある。本リポジトリは Next.js 15 + 型付き ESLint + 大規模 `tsc` のため、設定を変えないと `next build` の「Linting and checking validity of types」段階で **SIGKILL** しやすい。

## 症状

- Vercel デプロイログで `next build` が途中終了（exit 137 など）
- ローカルでは `npm run build` が通るが、CI/Vercel だけ落ちる

## 対策（リポジトリ既定）

| 設定 | 場所 | 効果 |
|------|------|------|
| `eslint.ignoreDuringBuilds: true` | `next.config.js` | ビルド中の type-aware ESLint をスキップ（`tsc` と二重の TS プログラムを避ける） |
| `experimental.webpackBuildWorker: true` | 同上 | カスタム `webpack` がある場合でもコンパイルをワーカーに逃がし、型チェック前に親プロセスのヒープを解放 |
| `experimental.webpackMemoryOptimizations: true` | 同上 | Webpack のメモリ削減 |
| `NODE_OPTIONS=--max-old-space-size=4096` | `package.json` の `build` | 1 プロセスあたりのヒープ上限（ビルダー 8 GB 内に収める） |

**Lint はビルドに含めないが、品質ゲートは残す**: ローカル・CI では `npm run lint` を実行する（`next lint` と同じルール）。

## 開発者向けチェックリスト

1. 本番相当ビルド: `npm run build`（Node 24、`.nvmrc`）
2. Lint: `npm run lint`
3. 単体テスト: `npm run test:unit`

Vercel では `installCommand` が `npm install --include=optional`（`vercel.json`）。optional 依存を含めたインストール後に上記 `build` スクリプトが走る。

## 関連ファイル

- `next.config.js` — コメントに SIGKILL の原因説明あり
- `package.json` — `build` / `lint` スクリプト
- `vercel.json` — `installCommand`、Cron（ビルドとは別）
