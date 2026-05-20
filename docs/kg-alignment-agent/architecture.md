# KG Alignment Agent — アーキテクチャ

## 概要

```mermaid
flowchart TB
  subgraph cli [CLI scripts/kg-alignment-agent]
    Index[index.ts]
    Orch[orchestrator.ts]
    Planner[llm-planner.ts]
    CP[checkpoints.ts]
    Log[run-logger.ts]
    MCPc[mcp-client.ts]
  end
  subgraph next [Next.js]
    Route["/api/topic-spaces/:id/mcp"]
    TRPC[tRPC routers]
    DB[(Postgres)]
  end
  Index --> Orch
  Orch --> Planner
  Orch --> CP
  Orch --> Log
  Orch --> MCPc
  MCPc -->|Streamable HTTP + Cookie| Route
  Route --> TRPC --> DB
```

## 変更提案ライフサイクル

```mermaid
stateDiagram-v2
  [*] --> DRAFT: create_graph_edit_proposal_draft
  DRAFT --> DRAFT: merge_nodes_in_draft / upsert / deduplicate_edges
  DRAFT --> PENDING: submit_graph_edit_proposal
  PENDING --> IN_REVIEW: UI
  IN_REVIEW --> MERGED: admin merge
```

CLI は **PENDING まで**。MERGED は管理 UI の責務。

## MCP 改善との対応

| 改善 | エージェントでの利用 |
|------|----------------------|
| P0 `mcpToolIdentifier` フォールバック | ツール名の安定解決 |
| P0 認証エラー JSON | CLI が `isError` を検出 |
| P1 `find_duplicate_edges` | scan / plan |
| P1 `deduplicate_edges_in_draft` | execute |
| P1 `get_label_distribution` | scan / plan |

## 将来拡張（未実装）

- Web UI からのエージェント起動
- `AlignmentRun` の Prisma 永続化
- 変更提案の自動承認（意図的に非対応）
