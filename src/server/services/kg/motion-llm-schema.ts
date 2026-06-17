import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { GENERATIVE_MOTION_PLAN_RENDERER_VERSION } from "@/app/const/generative-motion-plan";

const EDGE_MOTION_LLM_MODEL =
  process.env.EDGE_MOTION_LLM_MODEL ?? "gpt-5.4";

/** OpenAI Structured Outputs requires nullable instead of optional. */
const n = <T extends z.ZodTypeAny>(schema: T) => schema.nullable();

const CdtCategorySchema = z.enum([
  "PTRANS",
  "ATRANS",
  "PROPEL",
  "MOVE",
  "INGEST",
  "EXPEL",
  "SPEAK",
  "MENTAL",
]);

const MotionStyleSchema = z.enum([
  "run",
  "fight",
  "dance",
  "wave",
  "reach",
  "speak",
  "idle",
]);

const DirectionHintSchema = z.enum(["right", "left", "auto", "unknown"]);

const MotionIntentSchema = z.object({
  style: MotionStyleSchema,
  energy: n(z.number().min(0).max(1)),
  dominantSide: n(z.enum(["left", "right", "both", "none"])),
  tempo: n(z.enum(["slow", "normal", "fast"])),
  symmetry: n(z.enum(["mirror", "offset", "asymmetric"])),
  contactEmphasis: n(z.boolean()),
  directionHint: n(DirectionHintSchema),
});

const AssetKindSchema = z.enum([
  "human",
  "object",
  "place",
  "concept",
  "speech",
  "thought",
  "abstract",
]);

export const MotionStoryboardItemSchema = z.object({
  edgeId: z.string(),
  cdtCategory: CdtCategorySchema,
  motionIntent: MotionIntentSchema,
  storyboard: z.string().min(1).max(500),
  requiredParts: z.array(z.string()).min(1).max(8),
  assetHint: z.object({
    kind: AssetKindSchema,
    assetId: n(z.string()),
  }),
});

export const StageAOutputSchema = z.object({
  items: z.array(MotionStoryboardItemSchema).min(1),
});

export type MotionStoryboardItem = z.infer<typeof MotionStoryboardItemSchema>;
export type StageAOutput = z.infer<typeof StageAOutputSchema>;

/** Defaults for nullable motionIntent fields (OpenAI Structured Outputs). */
export const NULLABLE_MOTION_INTENT_FIELDS = {
  energy: null,
  dominantSide: null,
  tempo: null,
  symmetry: null,
  contactEmphasis: null,
  directionHint: null,
} as const;

export function apiMotionIntent(
  overrides: {
    style: z.infer<typeof MotionStyleSchema>;
    energy?: number | null;
    dominantSide?: "left" | "right" | "both" | "none" | null;
    tempo?: "slow" | "normal" | "fast" | null;
    symmetry?: "mirror" | "offset" | "asymmetric" | null;
    contactEmphasis?: boolean | null;
    directionHint?: z.infer<typeof DirectionHintSchema> | null;
  },
) {
  return { ...NULLABLE_MOTION_INTENT_FIELDS, ...overrides };
}

/** Defaults for nullable operation fields on Stage B API output. */
export const NULLABLE_OPERATION_FIELDS = {
  role: null,
  timing: null,
  repeat: null,
  easing: null,
  phase: null,
  fromOffset: null,
  toOffset: null,
  fromDegrees: null,
  toDegrees: null,
  origin: null,
} as const;

const MotionOperationTimingSchema = z.object({
  start: z.number().min(0).max(1),
  duration: z.number().min(0.05).max(1),
});

const MotionOperationRoleSchema = z.enum([
  "anticipation",
  "action",
  "reaction",
  "effect",
  "idle",
]);

const MotionTargetSchema = z.enum([
  "sourceNode",
  "targetNode",
  "edgeGlyph",
  "transferredObject",
  "speechBubble",
  "thoughtBubble",
  "human.head",
  "human.body",
  "human.leftArm",
  "human.rightArm",
  "human.leftLeg",
  "human.rightLeg",
]);

const MotionOperationBaseSchema = z.object({
  role: n(MotionOperationRoleSchema),
  timing: n(MotionOperationTimingSchema),
  repeat: n(z.enum(["loop", "once", "yoyo"])),
  easing: n(z.enum(["linear", "easeInOut", "easeOut", "impact", "breath"])),
  phase: n(z.number().min(0).max(1)),
});

const StageBOperationSchema = z.discriminatedUnion("type", [
  MotionOperationBaseSchema.extend({
    type: z.literal("pathMovement"),
    target: MotionTargetSchema,
    path: z.enum(["alongEdge", "towardSource", "towardTarget", "arc", "jitter"]),
    amplitude: z.number(),
    fromOffset: n(z.number()),
    toOffset: n(z.number()),
  }),
  MotionOperationBaseSchema.extend({
    type: z.literal("scale"),
    target: MotionTargetSchema,
    from: z.number(),
    to: z.number(),
  }),
  MotionOperationBaseSchema.extend({
    type: z.literal("rotation"),
    target: MotionTargetSchema,
    degrees: z.number(),
    fromDegrees: n(z.number()),
    toDegrees: n(z.number()),
    origin: n(z.enum(["center", "shoulder", "hip", "neck", "custom"])),
  }),
  MotionOperationBaseSchema.extend({
    type: z.literal("flip"),
    target: MotionTargetSchema,
    axis: z.enum(["x", "y"]),
  }),
  MotionOperationBaseSchema.extend({
    type: z.literal("appearance"),
    target: MotionTargetSchema,
    mode: z.enum(["fade", "scaleIn", "popIn"]),
  }),
  MotionOperationBaseSchema.extend({
    type: z.literal("disappearance"),
    target: MotionTargetSchema,
    mode: z.enum(["fade", "scaleOut", "vanish"]),
  }),
]);

const MotionPresetSchema = z.enum([
  "path",
  "disappearReappear",
  "pathAndDisappear",
  "appearAndPath",
  "dialogueBubble",
  "thoughtBubble",
  "bodyPartMotion",
  "impactMotion",
  "ambientGlow",
]);

export const StageBOutputSchema = z.object({
  edgeId: z.string(),
  motionPlan: z.object({
    version: z.literal("motion-plan/v1"),
    rendererVersion: z.literal(GENERATIVE_MOTION_PLAN_RENDERER_VERSION),
    semantic: z.object({
      intent: n(z.string()),
      confidence: z.number().min(0).max(1),
    }),
    participants: z.object({
      sourceRole: z.enum([
        "actor",
        "sender",
        "container",
        "speaker",
        "thinker",
        "unknown",
      ]),
      targetRole: z.enum([
        "recipient",
        "destination",
        "object",
        "listener",
        "concept",
        "unknown",
      ]),
      primaryTarget: z.enum([
        "source",
        "target",
        "edgeGlyph",
        "transferredObject",
        "bothNodes",
      ]),
      direction: z.enum([
        "sourceToTarget",
        "targetToSource",
        "bidirectional",
        "inward",
        "outward",
        "none",
      ]),
    }),
    asset: z.object({
      kind: AssetKindSchema,
      assetId: z.string(),
      requiredParts: n(z.array(MotionTargetSchema)),
    }),
    recipe: z.object({
      preset: MotionPresetSchema,
      operations: z.array(StageBOperationSchema).min(3).max(16),
    }),
    playback: z.object({
      durationMs: z.number().min(400).max(8000),
      delayMs: n(z.number().min(0)),
      loop: z.boolean(),
      yoyo: n(z.boolean()),
      easing: z.enum(["linear", "easeInOut", "easeOut", "impact", "breath"]),
      intensity: z.number().min(0).max(1),
    }),
    motionIntent: n(MotionIntentSchema),
  }),
});

export type StageBOutput = z.infer<typeof StageBOutputSchema>;

export type StageBSource = "llm" | "template" | "fallback";

/** Strip nulls from structured LLM output before downstream normalization. */
export function stripNulls<T>(value: T): T {
  if (value === null) return undefined as T;
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => stripNulls(item)) as T;
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child === null) continue;
      out[key] = stripNulls(child);
    }
    return out as T;
  }
  return value;
}

export function getEdgeMotionPipelineVersion(): 1 | 2 {
  const raw = process.env.EDGE_MOTION_PIPELINE_VERSION?.trim();
  if (raw === "1") return 1;
  if (raw === "2") return 2;
  return process.env.NODE_ENV === "development" ? 2 : 1;
}

export function createEdgeMotionLlm(model = EDGE_MOTION_LLM_MODEL): ChatOpenAI {
  return new ChatOpenAI({
    temperature: 0,
    model,
  });
}

export function withStageAStructuredOutput(llm: ChatOpenAI) {
  return llm.withStructuredOutput(StageAOutputSchema);
}

export function withStageBStructuredOutput(llm: ChatOpenAI) {
  return llm.withStructuredOutput(StageBOutputSchema);
}

export function createStageAStructuredLlm(model = EDGE_MOTION_LLM_MODEL) {
  return withStageAStructuredOutput(createEdgeMotionLlm(model));
}

export function createStageBStructuredLlm(model = EDGE_MOTION_LLM_MODEL) {
  return withStageBStructuredOutput(createEdgeMotionLlm(model));
}
