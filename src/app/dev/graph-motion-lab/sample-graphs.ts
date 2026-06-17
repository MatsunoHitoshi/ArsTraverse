import type { GraphDocumentForFrontend } from "@/app/const/types";

export type SampleGraphId = "two-person" | "visit-story" | "chain-3hop";

export type SampleGraphFixture = {
  id: SampleGraphId;
  label: string;
  description: string;
  graph: GraphDocumentForFrontend;
};

export const SAMPLE_GRAPHS: SampleGraphFixture[] = [
  {
    id: "two-person",
    label: "Two Person",
    description: "最小ケース（2ノード1エッジ）— 中点配置の基準",
    graph: {
      nodes: [
        { id: "n-alice", name: "Alice", label: "Person", properties: {} },
        { id: "n-bob", name: "Bob", label: "Person", properties: {} },
      ],
      relationships: [
        {
          id: "e-greets",
          type: "GREETS",
          sourceId: "n-alice",
          targetId: "n-bob",
          properties: {},
        },
      ],
    },
  },
  {
    id: "visit-story",
    label: "Visit Story",
    description: "ナラティブ的な関係の切替（4ノード3エッジ）",
    graph: {
      nodes: [
        { id: "n-taro", name: "太郎", label: "Person", properties: {} },
        { id: "n-shop", name: "店", label: "Place", properties: {} },
        { id: "n-package", name: "荷物", label: "Object", properties: {} },
        { id: "n-product", name: "商品", label: "Object", properties: {} },
      ],
      relationships: [
        {
          id: "e-visit",
          type: "VISITS",
          sourceId: "n-taro",
          targetId: "n-shop",
          properties: {},
        },
        {
          id: "e-carry",
          type: "CARRIES",
          sourceId: "n-taro",
          targetId: "n-package",
          properties: {},
        },
        {
          id: "e-sell",
          type: "SELLS",
          sourceId: "n-shop",
          targetId: "n-product",
          properties: {},
        },
      ],
    },
  },
  {
    id: "chain-3hop",
    label: "Chain 3-hop",
    description: "鎖状グラフ — 方向性・facesLeft の確認",
    graph: {
      nodes: [
        { id: "n-a", name: "Alpha", label: "Node", properties: {} },
        { id: "n-b", name: "Beta", label: "Node", properties: {} },
        { id: "n-c", name: "Gamma", label: "Node", properties: {} },
        { id: "n-d", name: "Delta", label: "Node", properties: {} },
      ],
      relationships: [
        {
          id: "e-ab",
          type: "LEADS_TO",
          sourceId: "n-a",
          targetId: "n-b",
          properties: {},
        },
        {
          id: "e-bc",
          type: "LEADS_TO",
          sourceId: "n-b",
          targetId: "n-c",
          properties: {},
        },
        {
          id: "e-cd",
          type: "LEADS_TO",
          sourceId: "n-c",
          targetId: "n-d",
          properties: {},
        },
      ],
    },
  },
];

export const DEFAULT_SAMPLE_GRAPH_ID: SampleGraphId = "two-person";

export function getSampleGraphById(id: SampleGraphId): SampleGraphFixture {
  const found = SAMPLE_GRAPHS.find((g) => g.id === id);
  if (!found) return SAMPLE_GRAPHS[0]!;
  return found;
}
