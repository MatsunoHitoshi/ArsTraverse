/**
 * Edge Semantic Animation: CDT (Conceptual Dependency Theory) based animation
 *
 * Based on Schank's Conceptual Dependency Theory (CDT) and the DancingBoard paper (IUI 2025).
 * Each edge predicate is classified into one of 8 fundamental action categories,
 * which is then mapped to a visual animation on the knowledge graph.
 *
 * Reference: DancingBoard: Automated Storyboarding with Motion Pictograms (IUI 2025)
 */

import type { GenerativeMotionPlan } from "./generative-motion-plan";

export const CDT_CATEGORIES = [
  "PTRANS",
  "ATRANS",
  "PROPEL",
  "MOVE",
  "INGEST",
  "EXPEL",
  "SPEAK",
  "MENTAL",
] as const;

export type CdtCategory = (typeof CDT_CATEGORIES)[number];

export type EdgeMotionType =
  | "flow"
  | "extend"
  | "pulse-impact"
  | "wave"
  | "converge"
  | "diverge"
  | "pop"
  | "glow";

export type EdgeMotionConfig = {
  category: CdtCategory;
  /** エッジ色（stroke color） */
  color: string;
  /** アニメーションパターン */
  motionType: EdgeMotionType;
  /** Lucide アイコン名 */
  iconName: string;
  /** アニメーション速度 0.0（遅）〜 1.0（速） */
  speed: number;
  /** アニメーション継続時間(ms): 1000 / speed */
  durationMs: number;
  /** LLM/フォールバックで生成した、論文の atomic operations に基づく具象モーション計画 */
  generativeMotionPlan?: GenerativeMotionPlan;
};

/**
 * CDT カテゴリ → アニメーション設定のマッピング
 * DancingBoard の Table 2 に基づく atomic operations の組み合わせを参考にした
 */
export const CDT_ANIMATION_MAP: Record<CdtCategory, EdgeMotionConfig> = {
  /** 物体の位置移動: エッジに沿って粒子がA→B方向へ流れる */
  PTRANS: {
    category: "PTRANS",
    color: "#3b82f6",
    motionType: "flow",
    iconName: "ArrowRight",
    speed: 0.8,
    durationMs: 1250,
  },
  /** 抽象的な所有・権利の移行: エッジがゆっくり伸びる */
  ATRANS: {
    category: "ATRANS",
    color: "#14b8a6",
    motionType: "extend",
    iconName: "HandCoins",
    speed: 0.4,
    durationMs: 2500,
  },
  /** 物理的な力の適用（攻撃・衝突）: 高速点滅 + 衝撃 */
  PROPEL: {
    category: "PROPEL",
    color: "#ef4444",
    motionType: "pulse-impact",
    iconName: "Swords",
    speed: 0.9,
    durationMs: 1111,
  },
  /** 身体の一部の移動（接触・アプローチ）: サインカーブ波動 */
  MOVE: {
    category: "MOVE",
    color: "#f97316",
    motionType: "wave",
    iconName: "Activity",
    speed: 0.6,
    durationMs: 1667,
  },
  /** 内部への取り込み（吸収・合併）: 収束アニメ */
  INGEST: {
    category: "INGEST",
    color: "#8b5cf6",
    motionType: "converge",
    iconName: "Merge",
    speed: 0.5,
    durationMs: 2000,
  },
  /** 内部からの放出（分離・決別）: 放散アニメ */
  EXPEL: {
    category: "EXPEL",
    color: "#eab308",
    motionType: "diverge",
    iconName: "Split",
    speed: 0.7,
    durationMs: 1429,
  },
  /** 音声・発言（宣言・命令）: スケールポップ */
  SPEAK: {
    category: "SPEAK",
    color: "#22c55e",
    motionType: "pop",
    iconName: "MessageCircle",
    speed: 0.75,
    durationMs: 1333,
  },
  /** 思考・情報の伝達（認知・推測・インサイト）: ゆっくり発光 */
  MENTAL: {
    category: "MENTAL",
    color: "#6366f1",
    motionType: "glow",
    iconName: "Lightbulb",
    speed: 0.3,
    durationMs: 3333,
  },
};
