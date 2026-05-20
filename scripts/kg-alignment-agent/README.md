# kg-alignment-agent

CLI 実装のエントリポイントは [`index.ts`](./index.ts) です。

仕様・運用手順はリポジトリ直下のドキュメントを参照してください。

- [docs/kg-alignment-agent/README.md](../../docs/kg-alignment-agent/README.md)
- [docs/kg-alignment-agent/spec.md](../../docs/kg-alignment-agent/spec.md)
- [docs/kg-alignment-agent/operations.md](../../docs/kg-alignment-agent/operations.md)

## モジュール

| ファイル | 役割 |
|----------|------|
| `config.ts` | CLI 引数・環境変数 |
| `mcp-client.ts` | MCP Streamable HTTP クライアント |
| `orchestrator.ts` | フェーズ実行 |
| `llm-planner.ts` | OpenAI structured plan |
| `checkpoints.ts` | inquirer 対話 |
| `run-logger.ts` | JSONL / summary |
| `types.ts` | Zod スキーマ |
