# キュレーターの文章執筆へのこだわり：テキストから生成（処理フロー）

文章をLLMによって知識グラフに連動させる機構。ユーザが書いた見出し2・段落を「章＝セクション」「段落＝セグメント」として固定し、既存の知識グラフのノード・エッジと対応づける。

## 処理フロー図

```mermaid
flowchart TB
    subgraph UI["ワークスペース UI"]
        A[ユーザが見出し2・段落で文章を執筆]
        B[エンティティハイライト付き]
        C[ストーリーテリングモード ON]
        D[モーダルで「テキストから生成」選択]
    end

    subgraph Parse["本文パース"]
        E[extractSectionsWithSegments]
        F[Heading2 → セクション]
        G[Paragraph → セグメント]
        H[findEntityHighlights で entityNames]
    end

    subgraph Backend["サーバ処理"]
        I[integrateWorkspaceTextGraph<br/>本文からKG抽出→TopicSpace統合]
        J[assignCommunitiesToSections<br/>セクションの entityNames をシードに Louvain]
        K[buildMetaGraphFromTextSections<br/>章＝セクション順・narrativeFlow 構築]
        L[runAnnotateStorySegments<br/>各セグメントを LLM で nodeIds/edgeIds 推定]
        M[detailedStories: 段落に segmentNodeIds/segmentEdgeIds 付与]
    end

    subgraph Storyboard["ストーリーボード"]
        N[SnapshotStoryboard: 章・段落を表示]
        O[段落クリック → グラフで該当ノード・エッジハイライト]
        P[編集保存時: 段落数同じなら attrs 維持<br/>増減時は再アノテーション]
    end

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    E --> G
    E --> H
    F --> I
    G --> I
    H --> I
    I --> J
    J --> K
    K --> L
    L --> M
    M --> N
    N --> O
    N --> P
```

## 関連ファイル

- `src/app/_utils/text/parse-content-sections.ts` — extractSectionsWithSegments
- `src/app/_utils/text/find-entity-highlights.ts` — findEntityHighlights
- `src/server/api/routers/kg-copilot.ts` — integrateWorkspaceTextGraph, assignCommunitiesToSections, buildMetaGraphFromTextSections, runAnnotateStorySegments
- `src/app/_components/curators-writing-workspace/artifact/snapshot-storyboard.tsx` — SnapshotStoryboard
