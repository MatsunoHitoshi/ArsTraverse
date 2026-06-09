import type { CdtCategory } from "./edge-cdt-animation";
import {
  applyDirectionHintToOperations,
  mergeRunTemplateIntoPlan,
  resolveMotionIntent,
  type DirectionHint,
  type MotionIntent,
  type MotionStyle,
} from "./motion-intent";

export const GENERATIVE_MOTION_PLAN_RENDERER_VERSION = 8;

export const MOTION_PRESETS = [
  "path",
  "disappearReappear",
  "pathAndDisappear",
  "appearAndPath",
  "dialogueBubble",
  "thoughtBubble",
  "bodyPartMotion",
  "impactMotion",
  "ambientGlow",
] as const;

export type MotionPreset = (typeof MOTION_PRESETS)[number];

export const MOTION_TARGETS = [
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
] as const;

export type MotionTarget = (typeof MOTION_TARGETS)[number];

export type MotionOperationRole =
  | "anticipation"
  | "action"
  | "reaction"
  | "effect"
  | "idle";

export type MotionOperationTiming = {
  /** Normalized start position within one playback cycle: 0..1 */
  start: number;
  /** Normalized active duration within one playback cycle: 0..1 */
  duration: number;
};

export type MotionOperationRepeat = "loop" | "once" | "yoyo";

type MotionOperationBase = {
  role?: MotionOperationRole;
  timing?: MotionOperationTiming;
  repeat?: MotionOperationRepeat;
  easing?: "linear" | "easeInOut" | "easeOut" | "impact" | "breath";
};

export type MotionOperation =
  | (MotionOperationBase & {
      type: "pathMovement";
      target: MotionTarget;
      path: "alongEdge" | "towardSource" | "towardTarget" | "arc" | "jitter";
      amplitude: number;
      /** Explicit local offset override in px. For edge paths this is projected onto the edge vector. */
      fromOffset?: number;
      /** Explicit local offset override in px. For edge paths this is projected onto the edge vector. */
      toOffset?: number;
      phase?: number;
      /** 4-phase vertical bob keyframes (Contact/Down/Pass/Up) in px. */
      keyframes?: {
        contact: number;
        down: number;
        pass: number;
        up: number;
      };
    })
  | (MotionOperationBase & {
      type: "scale";
      target: MotionTarget;
      from: number;
      to: number;
      phase?: number;
    })
  | (MotionOperationBase & {
      type: "rotation";
      target: MotionTarget;
      /** Backward-compatible symmetric amplitude. Prefer fromDegrees/toDegrees for concrete gestures. */
      degrees: number;
      fromDegrees?: number;
      toDegrees?: number;
      origin?: "center" | "shoulder" | "hip" | "neck" | "custom";
      phase?: number;
      /** 4-phase running-cycle keyframes (Contact/Down/Pass/Up). When set, overrides from/to with a richer cycle. */
      keyframes?: {
        contact: number;
        down: number;
        pass: number;
        up: number;
      };
    })
  | (MotionOperationBase & {
      type: "flip";
      target: MotionTarget;
      axis: "x" | "y";
      phase?: number;
    })
  | (MotionOperationBase & {
      type: "appearance";
      target: MotionTarget;
      mode: "fade" | "scaleIn" | "popIn";
      phase?: number;
    })
  | (MotionOperationBase & {
      type: "disappearance";
      target: MotionTarget;
      mode: "fade" | "scaleOut" | "vanish";
      phase?: number;
    });

export type GenerativeMotionPlan = {
  version: "motion-plan/v1";
  /** Renderer capability version. Increment when cached plans should be regenerated. */
  rendererVersion: typeof GENERATIVE_MOTION_PLAN_RENDERER_VERSION;
  semantic: {
    cdtCategory: CdtCategory;
    predicate: string;
    confidence: number;
    intent?: string;
  };
  participants: {
    sourceRole:
      | "actor"
      | "sender"
      | "container"
      | "speaker"
      | "thinker"
      | "unknown";
    targetRole:
      | "recipient"
      | "destination"
      | "object"
      | "listener"
      | "concept"
      | "unknown";
    primaryTarget:
      | "source"
      | "target"
      | "edgeGlyph"
      | "transferredObject"
      | "bothNodes";
    direction:
      | "sourceToTarget"
      | "targetToSource"
      | "bidirectional"
      | "inward"
      | "outward"
      | "none";
  };
  asset: {
    kind:
      | "human"
      | "object"
      | "place"
      | "concept"
      | "speech"
      | "thought"
      | "abstract";
    assetId: string;
    requiredParts?: MotionTarget[];
  };
  recipe: {
    preset: MotionPreset;
    operations: MotionOperation[];
  };
  playback: {
    durationMs: number;
    delayMs?: number;
    loop: boolean;
    yoyo?: boolean;
    easing: "linear" | "easeInOut" | "easeOut" | "impact" | "breath";
    intensity: number;
  };
  /** Optional high-level choreography intent (LLM or server-inferred). */
  motionIntent?: MotionIntent;
};

export type MotionPlanContext = {
  sourceName?: string;
  sourceLabel?: string;
  targetName?: string;
  targetLabel?: string;
  directionHint?: DirectionHint;
  motionIntent?: MotionIntent;
};

const PRESET_SET = new Set<string>(MOTION_PRESETS);
const TARGET_SET = new Set<string>(MOTION_TARGETS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseKeyframes4(
  raw: unknown,
): { contact: number; down: number; pass: number; up: number } | undefined {
  if (!isRecord(raw)) return undefined;
  const c = typeof raw.contact === "number" ? raw.contact : undefined;
  const d = typeof raw.down === "number" ? raw.down : undefined;
  const p = typeof raw.pass === "number" ? raw.pass : undefined;
  const u = typeof raw.up === "number" ? raw.up : undefined;
  if (c == null || d == null || p == null || u == null) return undefined;
  const clamp = (v: number) => Math.min(90, Math.max(-90, v));
  return { contact: clamp(c), down: clamp(d), pass: clamp(p), up: clamp(u) };
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numeric));
}

function pickString<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickKnownString<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const picked = pickString(value, allowed, fallback);
  return picked === "unknown" && fallback !== "unknown" ? fallback : picked;
}

function pickTarget(value: unknown, fallback: MotionTarget): MotionTarget {
  return typeof value === "string" && TARGET_SET.has(value)
    ? (value as MotionTarget)
    : fallback;
}

function numericOffset(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  if (isRecord(value)) {
    const x = typeof value.x === "number" ? value.x : null;
    const y = typeof value.y === "number" ? value.y : null;
    if (x != null && y != null) {
      return Math.abs(y) > Math.abs(x) ? y : x;
    }
    if (x != null) return x;
    if (y != null) return y;
  }
  return fallback;
}

function normalizeOffsetMagnitude(value: number): number {
  if (value !== 0 && Math.abs(value) <= 1) {
    return value * 12;
  }
  return value;
}

function normalizeOperationCommon(raw: Record<string, unknown>) {
  const phase = clampNumber(raw.phase, 0, 0, 1);
  const timingRaw = isRecord(raw.timing) ? raw.timing : null;
  const timing = timingRaw
    ? {
        start: clampNumber(timingRaw.start, phase, 0, 1),
        duration: clampNumber(timingRaw.duration, 1, 0.05, 1),
      }
    : undefined;

  return {
    ...(phase > 0 ? { phase } : {}),
    role: pickString(
      raw.role,
      ["anticipation", "action", "reaction", "effect", "idle"] as const,
      "action",
    ),
    ...(timing ? { timing } : {}),
    repeat: pickString(raw.repeat, ["loop", "once", "yoyo"] as const, "yoyo"),
    easing: pickString(
      raw.easing,
      ["linear", "easeInOut", "easeOut", "impact", "breath"] as const,
      "easeInOut",
    ),
  };
}

function normalizeMotionOperation(
  raw: unknown,
  fallbackTarget: MotionTarget,
): MotionOperation | null {
  if (!isRecord(raw)) return null;
  const target = pickTarget(raw.target, fallbackTarget);
  const common = normalizeOperationCommon(raw);
  const pathMovement = isRecord(raw.pathMovement) ? raw.pathMovement : {};
  const scale = isRecord(raw.scale) ? raw.scale : {};

  switch (raw.type) {
    case "pathMovement": {
      const base = {
        type: "pathMovement" as const,
        target,
        path: pickString(
          raw.path,
          [
            "alongEdge",
            "towardSource",
            "towardTarget",
            "arc",
            "jitter",
          ] as const,
          "alongEdge",
        ),
        amplitude: clampNumber(raw.amplitude, 8, 0, 32),
        fromOffset: clampNumber(
          normalizeOffsetMagnitude(
            numericOffset(raw.fromOffset ?? pathMovement.fromOffset, -8),
          ),
          -8,
          -48,
          48,
        ),
        toOffset: clampNumber(
          normalizeOffsetMagnitude(
            numericOffset(raw.toOffset ?? pathMovement.toOffset, 8),
          ),
          8,
          -48,
          48,
        ),
        ...common,
      };
      const kf = parseKeyframes4(raw.keyframes);
      return kf ? { ...base, keyframes: kf } : base;
    }
    case "scale":
      return {
        type: "scale",
        target,
        from: clampNumber(raw.from ?? scale.from, 0.9, 0.25, 2),
        to: clampNumber(raw.to ?? scale.to, 1.15, 0.25, 2),
        ...common,
      };
    case "rotation": {
      const degrees = clampNumber(raw.degrees, 12, -60, 60);
      const rotBase = {
        type: "rotation" as const,
        target,
        degrees,
        fromDegrees: clampNumber(raw.fromDegrees, -degrees, -90, 90),
        toDegrees: clampNumber(raw.toDegrees, degrees, -90, 90),
        origin: pickString(
          raw.origin,
          ["center", "shoulder", "hip", "neck", "custom"] as const,
          "center",
        ),
        ...common,
      };
      const rkf = parseKeyframes4(raw.keyframes);
      return rkf ? { ...rotBase, keyframes: rkf } : rotBase;
    }
    case "flip":
      return {
        type: "flip",
        target,
        axis: pickString(raw.axis, ["x", "y"] as const, "x"),
        ...common,
      };
    case "appearance":
      return {
        type: "appearance",
        target,
        mode: pickString(
          raw.mode,
          ["fade", "scaleIn", "popIn"] as const,
          "scaleIn",
        ),
        ...common,
      };
    case "disappearance":
      return {
        type: "disappearance",
        target,
        mode: pickString(
          raw.mode,
          ["fade", "scaleOut", "vanish"] as const,
          "fade",
        ),
        ...common,
      };
    default:
      return null;
  }
}

function looksHuman(context?: MotionPlanContext): boolean {
  const text = [
    context?.sourceName,
    context?.sourceLabel,
    context?.targetName,
    context?.targetLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  return /\b(PERSON|HUMAN|CHARACTER|ARTIST|AUTHOR|CREATOR|PEOPLE)\b|人物|人間|作者|作家|芸術家/.test(
    text,
  );
}

function defaultAssetKind(
  category: CdtCategory,
  context?: MotionPlanContext,
): GenerativeMotionPlan["asset"]["kind"] {
  if (
    looksHuman(context) &&
    ["PTRANS", "ATRANS", "PROPEL", "MOVE", "SPEAK", "MENTAL"].includes(category)
  ) {
    return "human";
  }
  if (category === "SPEAK") return "speech";
  if (category === "MENTAL") return "thought";
  if (category === "PTRANS") return "object";
  if (category === "ATRANS") return "object";
  if (category === "INGEST" || category === "EXPEL") return "object";
  if (category === "MOVE" || category === "PROPEL") return "abstract";
  return "abstract";
}

function defaultRecipe(
  category: CdtCategory,
): Pick<GenerativeMotionPlan["recipe"], "preset" | "operations"> {
  switch (category) {
    case "PTRANS":
      return {
        preset: "path",
        operations: [
          {
            type: "pathMovement",
            target: "edgeGlyph",
            path: "alongEdge",
            amplitude: 10,
            fromOffset: -10,
            toOffset: 10,
            role: "effect",
            timing: { start: 0, duration: 1 },
            repeat: "loop",
          },
          {
            type: "rotation",
            target: "human.leftLeg",
            degrees: 18,
            fromDegrees: -18,
            toDegrees: 18,
            origin: "hip",
            role: "action",
            timing: { start: 0, duration: 1 },
            repeat: "yoyo",
          },
          {
            type: "rotation",
            target: "human.rightLeg",
            degrees: 18,
            fromDegrees: 18,
            toDegrees: -18,
            origin: "hip",
            phase: 0.5,
            role: "action",
            timing: { start: 0, duration: 1 },
            repeat: "yoyo",
          },
        ],
      };
    case "ATRANS":
      return {
        preset: "disappearReappear",
        operations: [
          {
            type: "pathMovement",
            target: "transferredObject",
            path: "towardTarget",
            amplitude: 12,
            fromOffset: -12,
            toOffset: 12,
            role: "effect",
            timing: { start: 0.05, duration: 0.75 },
            repeat: "loop",
          },
          {
            type: "disappearance",
            target: "sourceNode",
            mode: "fade",
            role: "action",
            timing: { start: 0.15, duration: 0.35 },
          },
          {
            type: "appearance",
            target: "targetNode",
            mode: "scaleIn",
            phase: 0.5,
            role: "reaction",
            timing: { start: 0.5, duration: 0.35 },
          },
        ],
      };
    case "PROPEL":
      return {
        preset: "impactMotion",
        operations: [
          {
            type: "rotation",
            target: "human.rightArm",
            degrees: 38,
            fromDegrees: -28,
            toDegrees: 42,
            origin: "shoulder",
            role: "action",
            timing: { start: 0.08, duration: 0.55 },
            repeat: "yoyo",
            easing: "impact",
          },
          {
            type: "pathMovement",
            target: "sourceNode",
            path: "towardTarget",
            amplitude: 8,
            fromOffset: -2,
            toOffset: 8,
            role: "action",
            timing: { start: 0.12, duration: 0.45 },
            repeat: "yoyo",
            easing: "impact",
          },
          {
            type: "scale",
            target: "edgeGlyph",
            from: 0.75,
            to: 1.45,
            role: "effect",
            timing: { start: 0.3, duration: 0.35 },
            repeat: "yoyo",
            easing: "impact",
          },
        ],
      };
    case "MOVE":
      return {
        preset: "bodyPartMotion",
        operations: [
          {
            type: "rotation",
            target: "human.leftArm",
            degrees: 18,
            fromDegrees: -18,
            toDegrees: 18,
            origin: "shoulder",
            role: "action",
            timing: { start: 0, duration: 1 },
            repeat: "yoyo",
          },
          {
            type: "rotation",
            target: "human.rightArm",
            degrees: 18,
            fromDegrees: 18,
            toDegrees: -18,
            origin: "shoulder",
            phase: 0.5,
            role: "action",
            timing: { start: 0, duration: 1 },
            repeat: "yoyo",
          },
          {
            type: "pathMovement",
            target: "human.body",
            path: "jitter",
            amplitude: 3,
            fromOffset: -3,
            toOffset: 3,
            role: "action",
            timing: { start: 0, duration: 1 },
            repeat: "yoyo",
          },
          {
            type: "scale",
            target: "edgeGlyph",
            from: 0.9,
            to: 1.18,
            role: "effect",
            timing: { start: 0.1, duration: 0.8 },
            repeat: "yoyo",
          },
        ],
      };
    case "INGEST":
      return {
        preset: "pathAndDisappear",
        operations: [
          {
            type: "pathMovement",
            target: "transferredObject",
            path: "towardSource",
            amplitude: 12,
            fromOffset: 12,
            toOffset: -12,
            role: "action",
            timing: { start: 0, duration: 0.75 },
            repeat: "loop",
          },
          {
            type: "disappearance",
            target: "transferredObject",
            mode: "scaleOut",
            phase: 0.6,
            role: "effect",
            timing: { start: 0.58, duration: 0.32 },
          },
        ],
      };
    case "EXPEL":
      return {
        preset: "appearAndPath",
        operations: [
          {
            type: "appearance",
            target: "transferredObject",
            mode: "popIn",
            role: "effect",
            timing: { start: 0, duration: 0.25 },
          },
          {
            type: "pathMovement",
            target: "transferredObject",
            path: "towardTarget",
            amplitude: 14,
            fromOffset: -4,
            toOffset: 14,
            role: "action",
            timing: { start: 0.2, duration: 0.75 },
            repeat: "loop",
          },
        ],
      };
    case "SPEAK":
      return {
        preset: "dialogueBubble",
        operations: [
          {
            type: "appearance",
            target: "speechBubble",
            mode: "popIn",
            role: "effect",
            timing: { start: 0, duration: 0.25 },
          },
          {
            type: "scale",
            target: "speechBubble",
            from: 0.85,
            to: 1.18,
            role: "effect",
            timing: { start: 0.15, duration: 0.65 },
            repeat: "yoyo",
          },
          {
            type: "rotation",
            target: "human.head",
            degrees: 5,
            fromDegrees: -3,
            toDegrees: 5,
            origin: "neck",
            role: "action",
            timing: { start: 0.05, duration: 0.7 },
            repeat: "yoyo",
          },
        ],
      };
    case "MENTAL":
      return {
        preset: "thoughtBubble",
        operations: [
          {
            type: "appearance",
            target: "thoughtBubble",
            mode: "scaleIn",
            role: "effect",
            timing: { start: 0, duration: 0.35 },
          },
          {
            type: "scale",
            target: "thoughtBubble",
            from: 0.9,
            to: 1.12,
            role: "effect",
            timing: { start: 0.2, duration: 0.7 },
            repeat: "yoyo",
            easing: "breath",
          },
          {
            type: "scale",
            target: "human.head",
            from: 0.96,
            to: 1.04,
            role: "action",
            timing: { start: 0.1, duration: 0.8 },
            repeat: "yoyo",
            easing: "breath",
          },
        ],
      };
  }
}

function defaultParticipants(
  category: CdtCategory,
): GenerativeMotionPlan["participants"] {
  switch (category) {
    case "PTRANS":
      return {
        sourceRole: "actor",
        targetRole: "destination",
        primaryTarget: "source",
        direction: "sourceToTarget",
      };
    case "ATRANS":
      return {
        sourceRole: "sender",
        targetRole: "recipient",
        primaryTarget: "transferredObject",
        direction: "sourceToTarget",
      };
    case "INGEST":
      return {
        sourceRole: "container",
        targetRole: "object",
        primaryTarget: "transferredObject",
        direction: "inward",
      };
    case "EXPEL":
      return {
        sourceRole: "container",
        targetRole: "object",
        primaryTarget: "transferredObject",
        direction: "outward",
      };
    case "SPEAK":
      return {
        sourceRole: "speaker",
        targetRole: "listener",
        primaryTarget: "edgeGlyph",
        direction: "sourceToTarget",
      };
    case "MENTAL":
      return {
        sourceRole: "thinker",
        targetRole: "concept",
        primaryTarget: "edgeGlyph",
        direction: "none",
      };
    default:
      return {
        sourceRole: "actor",
        targetRole: "object",
        primaryTarget: "source",
        direction: "sourceToTarget",
      };
  }
}

function defaultPlayback(
  category: CdtCategory,
): GenerativeMotionPlan["playback"] {
  switch (category) {
    case "PROPEL":
      return {
        durationMs: 900,
        loop: true,
        yoyo: true,
        easing: "impact",
        intensity: 0.85,
      };
    case "MENTAL":
      return {
        durationMs: 3000,
        loop: true,
        yoyo: true,
        easing: "breath",
        intensity: 0.35,
      };
    case "SPEAK":
      return {
        durationMs: 1300,
        loop: true,
        yoyo: true,
        easing: "easeOut",
        intensity: 0.7,
      };
    default:
      return {
        durationMs: 1600,
        loop: true,
        yoyo: true,
        easing: "easeInOut",
        intensity: 0.6,
      };
  }
}

function operationsForAssetKind(
  operations: MotionOperation[],
  assetKind: GenerativeMotionPlan["asset"]["kind"],
): MotionOperation[] {
  if (assetKind === "human") return operations;
  return operations.filter(
    (operation) => !operation.target.startsWith("human."),
  );
}

function ensureHumanAssetHasBodyMotion(
  operations: MotionOperation[],
  assetKind: GenerativeMotionPlan["asset"]["kind"],
): MotionOperation[] {
  if (
    assetKind !== "human" ||
    operations.some((operation) => operation.target.startsWith("human."))
  ) {
    return operations;
  }

  return [
    ...operations,
    {
      type: "scale",
      target: "human.body",
      from: 0.96,
      to: 1.06,
      role: "action",
      timing: { start: 0.1, duration: 0.7 },
      repeat: "yoyo",
      easing: "easeInOut",
    },
  ];
}

function defaultHeadMicroMotion(category: CdtCategory): MotionOperation {
  switch (category) {
    case "PROPEL":
      return {
        type: "rotation",
        target: "human.head",
        degrees: 8,
        fromDegrees: -4,
        toDegrees: 8,
        origin: "neck",
        role: "anticipation",
        timing: { start: 0.05, duration: 0.5 },
        repeat: "yoyo",
        easing: "impact",
      };
    case "MENTAL":
      return {
        type: "rotation",
        target: "human.head",
        degrees: 5,
        fromDegrees: -5,
        toDegrees: 5,
        origin: "neck",
        role: "action",
        timing: { start: 0, duration: 1 },
        repeat: "yoyo",
        easing: "breath",
      };
    case "SPEAK":
      return {
        type: "rotation",
        target: "human.head",
        degrees: 6,
        fromDegrees: -4,
        toDegrees: 6,
        origin: "neck",
        role: "action",
        timing: { start: 0.05, duration: 0.7 },
        repeat: "yoyo",
        easing: "easeInOut",
      };
    default:
      return {
        type: "rotation",
        target: "human.head",
        degrees: 4,
        fromDegrees: -3,
        toDegrees: 4,
        origin: "neck",
        role: "anticipation",
        timing: { start: 0, duration: 1 },
        repeat: "yoyo",
        easing: "easeInOut",
      };
  }
}

/**
 * `human` asset で `human.head` 操作が無い場合、CDT 別の微小頭部運動を常時補完する。
 * LLM が頭部を忘れがちな MOVE/PTRANS でも、首振りや小さな揺れで顔が「生きている」状態を保つ。
 */
function ensureHumanHeadIsAlive(
  operations: MotionOperation[],
  assetKind: GenerativeMotionPlan["asset"]["kind"],
  category: CdtCategory,
): MotionOperation[] {
  if (assetKind !== "human") return operations;
  if (operations.some((operation) => operation.target === "human.head")) {
    return operations;
  }
  return [...operations, defaultHeadMicroMotion(category)];
}

const WALK_CYCLE_SUPPLEMENTS: MotionOperation[] = [
  {
    type: "rotation",
    target: "human.leftLeg",
    degrees: 24,
    fromDegrees: -24,
    toDegrees: 24,
    origin: "hip",
    role: "action",
    timing: { start: 0, duration: 1 },
    repeat: "yoyo",
  },
  {
    type: "rotation",
    target: "human.rightLeg",
    degrees: 24,
    fromDegrees: 24,
    toDegrees: -24,
    origin: "hip",
    phase: 0.5,
    role: "action",
    timing: { start: 0, duration: 1 },
    repeat: "yoyo",
  },
  {
    type: "rotation",
    target: "human.leftArm",
    degrees: 18,
    fromDegrees: 18,
    toDegrees: -18,
    origin: "shoulder",
    phase: 0.5,
    role: "action",
    timing: { start: 0, duration: 1 },
    repeat: "yoyo",
  },
  {
    type: "rotation",
    target: "human.rightArm",
    degrees: 18,
    fromDegrees: -18,
    toDegrees: 18,
    origin: "shoulder",
    role: "action",
    timing: { start: 0, duration: 1 },
    repeat: "yoyo",
  },
  {
    type: "pathMovement",
    target: "human.body",
    path: "jitter",
    amplitude: 2,
    fromOffset: -2,
    toOffset: 2,
    role: "anticipation",
    timing: { start: 0, duration: 1 },
    repeat: "yoyo",
  },
];

const PROPEL_PUNCH_SUPPLEMENTS: MotionOperation[] = [
  {
    type: "rotation",
    target: "human.rightArm",
    degrees: 42,
    fromDegrees: -30,
    toDegrees: 48,
    origin: "shoulder",
    role: "action",
    timing: { start: 0.08, duration: 0.55 },
    repeat: "yoyo",
    easing: "impact",
  },
  {
    type: "rotation",
    target: "human.leftArm",
    degrees: 14,
    fromDegrees: 14,
    toDegrees: -14,
    origin: "shoulder",
    role: "anticipation",
    timing: { start: 0, duration: 0.5 },
    repeat: "yoyo",
  },
  {
    type: "rotation",
    target: "human.body",
    degrees: 10,
    fromDegrees: -8,
    toDegrees: 10,
    origin: "hip",
    role: "anticipation",
    timing: { start: 0.05, duration: 0.5 },
    repeat: "yoyo",
    easing: "impact",
  },
];

const SPEAK_GESTURE_SUPPLEMENTS: MotionOperation[] = [
  {
    type: "rotation",
    target: "human.head",
    degrees: 6,
    fromDegrees: -4,
    toDegrees: 6,
    origin: "neck",
    role: "action",
    timing: { start: 0.05, duration: 0.7 },
    repeat: "yoyo",
  },
  {
    type: "rotation",
    target: "human.rightArm",
    degrees: 22,
    fromDegrees: 4,
    toDegrees: 28,
    origin: "shoulder",
    role: "action",
    timing: { start: 0.1, duration: 0.6 },
    repeat: "yoyo",
  },
  {
    type: "scale",
    target: "human.body",
    from: 0.98,
    to: 1.04,
    role: "anticipation",
    timing: { start: 0, duration: 0.8 },
    repeat: "yoyo",
  },
];

const MENTAL_GESTURE_SUPPLEMENTS: MotionOperation[] = [
  {
    type: "rotation",
    target: "human.head",
    degrees: 5,
    fromDegrees: -5,
    toDegrees: 5,
    origin: "neck",
    role: "action",
    timing: { start: 0, duration: 1 },
    repeat: "yoyo",
    easing: "breath",
  },
  {
    type: "scale",
    target: "human.body",
    from: 0.97,
    to: 1.03,
    role: "anticipation",
    timing: { start: 0.1, duration: 0.8 },
    repeat: "yoyo",
    easing: "breath",
  },
];

const ATRANS_REACH_SUPPLEMENTS: MotionOperation[] = [
  {
    type: "rotation",
    target: "human.rightArm",
    degrees: 28,
    fromDegrees: -10,
    toDegrees: 32,
    origin: "shoulder",
    role: "action",
    timing: { start: 0.05, duration: 0.6 },
    repeat: "yoyo",
  },
  {
    type: "rotation",
    target: "human.leftArm",
    degrees: 12,
    fromDegrees: 12,
    toDegrees: -8,
    origin: "shoulder",
    role: "anticipation",
    timing: { start: 0.05, duration: 0.6 },
    repeat: "yoyo",
  },
  {
    type: "pathMovement",
    target: "human.body",
    path: "jitter",
    amplitude: 2,
    fromOffset: -1,
    toOffset: 2,
    role: "anticipation",
    timing: { start: 0, duration: 1 },
    repeat: "yoyo",
  },
];

function supplementsForCategory(category: CdtCategory): MotionOperation[] {
  switch (category) {
    case "PTRANS":
    case "MOVE":
      return WALK_CYCLE_SUPPLEMENTS;
    case "PROPEL":
      return PROPEL_PUNCH_SUPPLEMENTS;
    case "SPEAK":
      return SPEAK_GESTURE_SUPPLEMENTS;
    case "MENTAL":
      return MENTAL_GESTURE_SUPPLEMENTS;
    case "ATRANS":
      return ATRANS_REACH_SUPPLEMENTS;
    case "INGEST":
    case "EXPEL":
      return WALK_CYCLE_SUPPLEMENTS;
  }
}

/**
 * `human` asset で部位数が3未満なら、CDT に応じた多関節 choreography を補う。
 * LLM が `human.body` だけしか出さなくても、対位相の手足振りで具体動作を表現する。
 */
function enrichHumanChoreography(
  operations: MotionOperation[],
  assetKind: GenerativeMotionPlan["asset"]["kind"],
  category: CdtCategory,
): MotionOperation[] {
  if (assetKind !== "human") return operations;

  const usedHumanTargets = new Set(
    operations
      .map((operation) => operation.target)
      .filter((target) => target.startsWith("human.")),
  );
  if (usedHumanTargets.size >= 3) return operations;

  const supplements = supplementsForCategory(category).filter(
    (operation) => !usedHumanTargets.has(operation.target),
  );

  return [...operations, ...supplements].slice(0, 10);
}

/**
 * 操作数が3未満ならカテゴリごとのデフォルト recipe から重複しない操作を補う。
 * 非 human な ATRANS/PROPEL で edgeGlyph 1個など寂しい時の保険。
 */
function enrichSparseOperations(
  operations: MotionOperation[],
  assetKind: GenerativeMotionPlan["asset"]["kind"],
  category: CdtCategory,
): MotionOperation[] {
  if (operations.length >= 3) return operations;
  const usedKeys = new Set(
    operations.map((operation) => `${operation.type}:${operation.target}`),
  );
  const baseOps = operationsForAssetKind(
    defaultRecipe(category).operations,
    assetKind,
  );
  const supplements = baseOps.filter(
    (operation) => !usedKeys.has(`${operation.type}:${operation.target}`),
  );
  return [...operations, ...supplements].slice(0, 8);
}

/**
 * MOVE/PTRANS で four-limb 揃った場合、自然な歩行（contralateral）に位相を正規化する。
 * left{Leg/Arm} と right{Leg/Arm} の phase が同じだと「行進」になってしまうため、
 * leftLeg + rightArm を同位相、rightLeg + leftArm を 0.5 位相にずらす。
 */
const FIGHT_SUPPLEMENTS: MotionOperation[] = [
  {
    type: "rotation",
    target: "human.rightArm",
    degrees: 42,
    fromDegrees: -30,
    toDegrees: 48,
    origin: "shoulder",
    role: "action",
    timing: { start: 0.08, duration: 0.55 },
    repeat: "yoyo",
    easing: "impact",
  },
  {
    type: "rotation",
    target: "human.leftArm",
    degrees: 14,
    fromDegrees: 14,
    toDegrees: -14,
    origin: "shoulder",
    role: "anticipation",
    timing: { start: 0, duration: 0.5 },
    repeat: "yoyo",
  },
  {
    type: "rotation",
    target: "human.body",
    degrees: 10,
    fromDegrees: -8,
    toDegrees: 10,
    origin: "hip",
    role: "anticipation",
    timing: { start: 0.05, duration: 0.5 },
    repeat: "yoyo",
    easing: "impact",
  },
  {
    type: "scale",
    target: "edgeGlyph",
    from: 0.75,
    to: 1.45,
    role: "effect",
    timing: { start: 0.3, duration: 0.35 },
    repeat: "yoyo",
    easing: "impact",
  },
];

const DANCE_SUPPLEMENTS: MotionOperation[] = [
  {
    type: "rotation",
    target: "human.leftArm",
    degrees: 28,
    fromDegrees: -22,
    toDegrees: 28,
    origin: "shoulder",
    role: "action",
    timing: { start: 0, duration: 1 },
    repeat: "loop",
    easing: "easeInOut",
  },
  {
    type: "rotation",
    target: "human.rightArm",
    degrees: 24,
    fromDegrees: 24,
    toDegrees: -24,
    origin: "shoulder",
    phase: 0.25,
    role: "action",
    timing: { start: 0, duration: 1 },
    repeat: "loop",
    easing: "easeInOut",
  },
  {
    type: "rotation",
    target: "human.leftLeg",
    degrees: 18,
    fromDegrees: -14,
    toDegrees: 18,
    origin: "hip",
    phase: 0.5,
    role: "action",
    timing: { start: 0, duration: 1 },
    repeat: "loop",
  },
  {
    type: "pathMovement",
    target: "human.body",
    path: "jitter",
    amplitude: 3,
    fromOffset: -3,
    toOffset: 3,
    role: "anticipation",
    timing: { start: 0, duration: 1 },
    repeat: "loop",
    easing: "easeInOut",
  },
];

function supplementsForMotionStyle(style: MotionStyle): MotionOperation[] {
  switch (style) {
    case "fight":
      return FIGHT_SUPPLEMENTS;
    case "dance":
      return DANCE_SUPPLEMENTS;
    case "run":
      return WALK_CYCLE_SUPPLEMENTS;
    default:
      return [];
  }
}

/**
 * fight / dance など複雑スタイル向けの choreography 補完。
 * 既存の enrichHumanChoreography（3部位未満）と併用する。
 */
function enrichComplexMotionStyle(
  operations: MotionOperation[],
  assetKind: GenerativeMotionPlan["asset"]["kind"],
  style: MotionStyle,
  dominantSide: MotionIntent["dominantSide"] = "right",
): MotionOperation[] {
  if (assetKind !== "human") return operations;
  if (style !== "fight" && style !== "dance") return operations;

  const usedKeys = new Set(
    operations.map((op) => `${op.type}:${op.target}:${op.role ?? "action"}`),
  );
  let supplements = supplementsForMotionStyle(style).filter(
    (op) => !usedKeys.has(`${op.type}:${op.target}:${op.role ?? "action"}`),
  );

  if (style === "fight" && dominantSide === "left") {
    supplements = supplements.map((op) => {
      if (op.type !== "rotation" || op.target !== "human.rightArm") return op;
      return {
        ...op,
        target: "human.leftArm",
        fromDegrees: op.fromDegrees != null ? -op.fromDegrees : undefined,
        toDegrees: op.toDegrees != null ? -op.toDegrees : undefined,
      };
    });
  }

  return [...operations, ...supplements].slice(0, 16);
}

function shouldUseRunTemplate(
  style: MotionStyle,
  assetKind: GenerativeMotionPlan["asset"]["kind"],
  operationsCount: number,
): boolean {
  return (
    style === "run" &&
    assetKind === "human" &&
    operationsCount < 8
  );
}

function enforceContralateralGait(
  operations: MotionOperation[],
  category: CdtCategory,
  assetId?: string,
): MotionOperation[] {
  if (category !== "MOVE" && category !== "PTRANS") return operations;
  // ランナー専用 SVG は同位相 + from/to 反転で 180° 対位相を構築しているため、
  // ここで phase を 0/0.5 に上書きしないでスキップする。
  if (assetId === "human-runner-right") return operations;
  const hasAll =
    ["human.leftLeg", "human.rightLeg", "human.leftArm", "human.rightArm"]
      .every((target) =>
        operations.some(
          (op) => op.type === "rotation" && op.target === target,
        ),
      );
  if (!hasAll) return operations;

  return operations.map((op) => {
    if (op.type !== "rotation") return op;
    if (op.target === "human.leftLeg") return { ...op, phase: 0 };
    if (op.target === "human.rightArm") return { ...op, phase: 0 };
    if (op.target === "human.rightLeg") return { ...op, phase: 0.5 };
    if (op.target === "human.leftArm") return { ...op, phase: 0.5 };
    return op;
  });
}

/**
 * 非 human の連続的なエッジ操作 (pathMovement/scale) が `repeat: "once"` のままだと
 * 1 回しか動かず可視性が低い。グラフ可視化では繰り返したいので yoyo/loop に格上げする。
 */
function ensureLoopingEdgeOps(
  operations: MotionOperation[],
  assetKind: GenerativeMotionPlan["asset"]["kind"],
): MotionOperation[] {
  if (assetKind === "human") return operations;
  return operations.map((op) => {
    if (op.type !== "pathMovement" && op.type !== "scale") return op;
    if (op.repeat === "loop" || op.repeat === "yoyo") return op;
    const targetRepeat: MotionOperationRepeat =
      op.type === "scale" ? "yoyo" : "loop";
    return { ...op, repeat: targetRepeat };
  });
}

function coerceAssetKindForContext(
  requestedKind: GenerativeMotionPlan["asset"]["kind"],
  fallbackKind: GenerativeMotionPlan["asset"]["kind"],
  context?: MotionPlanContext,
): GenerativeMotionPlan["asset"]["kind"] {
  if (requestedKind === "human" && !looksHuman(context)) {
    return fallbackKind === "human" ? "abstract" : fallbackKind;
  }
  return requestedKind;
}

function defaultAssetIdForKind(
  assetKind: GenerativeMotionPlan["asset"]["kind"],
): string {
  return assetKind === "human" ? "human-basic" : `${assetKind}-basic`;
}

function normalizeAssetIdForKind(
  value: unknown,
  assetKind: GenerativeMotionPlan["asset"]["kind"],
): string {
  if (
    typeof value === "string" &&
    /^[a-z0-9-]{1,40}$/i.test(value) &&
    (assetKind === "human" || !value.toLowerCase().startsWith("human-"))
  ) {
    return value;
  }
  return defaultAssetIdForKind(assetKind);
}

export function buildDefaultGenerativeMotionPlan(
  category: CdtCategory,
  predicate = "",
  context?: MotionPlanContext,
): GenerativeMotionPlan {
  const baseRecipe = defaultRecipe(category);
  const assetKind = defaultAssetKind(category, context);
  const operations = ensureHumanHeadIsAlive(
    enrichHumanChoreography(
      ensureHumanAssetHasBodyMotion(
        operationsForAssetKind(baseRecipe.operations, assetKind),
        assetKind,
      ),
      assetKind,
      category,
    ),
    assetKind,
    category,
  );
  const requiredParts =
    assetKind === "human"
      ? operations
          .map((operation) => operation.target)
          .filter((target): target is MotionTarget =>
            target.startsWith("human."),
          )
      : [];

  return {
    version: "motion-plan/v1",
    rendererVersion: GENERATIVE_MOTION_PLAN_RENDERER_VERSION,
    semantic: {
      cdtCategory: category,
      predicate,
      confidence: 0.6,
    },
    participants: defaultParticipants(category),
    asset: {
      kind: assetKind,
      assetId: defaultAssetIdForKind(assetKind),
      ...(requiredParts.length > 0 ? { requiredParts } : {}),
    },
    recipe: {
      ...baseRecipe,
      operations,
    },
    playback: defaultPlayback(category),
  };
}

export function normalizeGenerativeMotionPlan(
  raw: unknown,
  category: CdtCategory,
  predicate = "",
  context?: MotionPlanContext,
): GenerativeMotionPlan {
  const fallback = buildDefaultGenerativeMotionPlan(
    category,
    predicate,
    context,
  );
  if (!isRecord(raw)) return fallback;

  const semantic = isRecord(raw.semantic) ? raw.semantic : {};
  const participants = isRecord(raw.participants) ? raw.participants : {};
  const asset = isRecord(raw.asset) ? raw.asset : {};
  const recipe = isRecord(raw.recipe) ? raw.recipe : {};
  const playback = isRecord(raw.playback) ? raw.playback : {};

  const requestedAssetKind = pickString(
    asset.kind,
    [
      "human",
      "object",
      "place",
      "concept",
      "speech",
      "thought",
      "abstract",
    ] as const,
    fallback.asset.kind,
  );
  const assetKind = coerceAssetKindForContext(
    requestedAssetKind,
    fallback.asset.kind,
    context,
  );
  const operationsRaw = Array.isArray(recipe.operations)
    ? recipe.operations
    : Array.isArray(raw.operations)
      ? raw.operations
      : [];
  const motionIntent = resolveMotionIntent(raw, category, predicate, context);
  const directionHint = context?.directionHint ?? motionIntent.directionHint ?? "auto";

  const assetIdRaw =
    typeof asset.assetId === "string" ? asset.assetId : undefined;

  let normalizedOps = operationsForAssetKind(
    operationsRaw
      .map((operation) => normalizeMotionOperation(operation, "edgeGlyph"))
      .filter((operation): operation is MotionOperation => operation != null)
      .slice(0, 16),
    assetKind,
  );

  if (
    shouldUseRunTemplate(motionIntent.style, assetKind, normalizedOps.length)
  ) {
    const runMerged = mergeRunTemplateIntoPlan(
      {
        ...fallback,
        semantic: { ...fallback.semantic, cdtCategory: category, predicate },
      },
      predicate,
      { ...context, directionHint },
    );
    normalizedOps = runMerged.recipe.operations;
  }

  const operations = ensureLoopingEdgeOps(
    applyDirectionHintToOperations(
      enforceContralateralGait(
        ensureHumanHeadIsAlive(
          enrichSparseOperations(
            enrichComplexMotionStyle(
              enrichHumanChoreography(
                ensureHumanAssetHasBodyMotion(normalizedOps, assetKind),
                assetKind,
                category,
              ),
              assetKind,
              motionIntent.style,
              motionIntent.dominantSide,
            ),
            assetKind,
            category,
          ),
          assetKind,
          category,
        ),
        category,
        assetIdRaw ?? (motionIntent.style === "run" ? "human-runner-right" : undefined),
      ),
      directionHint,
      assetIdRaw ?? (motionIntent.style === "run" ? "human-runner-right" : undefined),
    ),
    assetKind,
  );

  const resolvedAssetId =
    motionIntent.style === "run" && assetKind === "human"
      ? "human-runner-right"
      : normalizeAssetIdForKind(asset.assetId, assetKind);
  const humanPartsFromOps = operations
    .map((operation) => operation.target)
    .filter((target): target is MotionTarget => target.startsWith("human."));
  const requiredParts =
    assetKind === "human"
      ? Array.from(
          new Set<MotionTarget>([
            ...(Array.isArray(asset.requiredParts)
              ? asset.requiredParts
                  .map((part) => pickTarget(part, "edgeGlyph"))
                  .filter((part) => part.startsWith("human."))
              : (fallback.asset.requiredParts ?? [])),
            ...humanPartsFromOps,
          ]),
        )
      : [];

  return {
    version: "motion-plan/v1",
    rendererVersion: GENERATIVE_MOTION_PLAN_RENDERER_VERSION,
    semantic: {
      cdtCategory: category,
      predicate,
      confidence: clampNumber(
        semantic.confidence,
        fallback.semantic.confidence,
        0,
        1,
      ),
      ...(typeof semantic.intent === "string" && semantic.intent.length <= 120
        ? { intent: semantic.intent }
        : fallback.semantic.intent
          ? { intent: fallback.semantic.intent }
          : {}),
    },
    participants: {
      sourceRole: pickKnownString(
        participants.sourceRole,
        [
          "actor",
          "sender",
          "container",
          "speaker",
          "thinker",
          "unknown",
        ] as const,
        fallback.participants.sourceRole,
      ),
      targetRole: pickKnownString(
        participants.targetRole,
        [
          "recipient",
          "destination",
          "object",
          "listener",
          "concept",
          "unknown",
        ] as const,
        fallback.participants.targetRole,
      ),
      primaryTarget: pickString(
        participants.primaryTarget,
        [
          "source",
          "target",
          "edgeGlyph",
          "transferredObject",
          "bothNodes",
        ] as const,
        fallback.participants.primaryTarget,
      ),
      direction: pickString(
        participants.direction,
        [
          "sourceToTarget",
          "targetToSource",
          "bidirectional",
          "inward",
          "outward",
          "none",
        ] as const,
        fallback.participants.direction,
      ),
    },
    asset: {
      kind: assetKind,
      assetId: resolvedAssetId,
      ...(requiredParts && requiredParts.length > 0 ? { requiredParts } : {}),
    },
    recipe: {
      preset:
        typeof recipe.preset === "string" && PRESET_SET.has(recipe.preset)
          ? (recipe.preset as MotionPreset)
          : fallback.recipe.preset,
      operations:
        operations.length > 0 ? operations : fallback.recipe.operations,
    },
    playback: {
      durationMs: clampNumber(
        playback.durationMs,
        fallback.playback.durationMs,
        500,
        6000,
      ),
      delayMs: clampNumber(
        playback.delayMs,
        fallback.playback.delayMs ?? 0,
        0,
        3000,
      ),
      loop:
        operations.some(
          (op) => op.repeat === "loop" || op.repeat === "yoyo",
        ) ||
        (typeof playback.loop === "boolean"
          ? playback.loop
          : fallback.playback.loop),
      yoyo:
        operations.some((op) => op.repeat === "yoyo") ||
        (typeof playback.yoyo === "boolean"
          ? playback.yoyo
          : fallback.playback.yoyo),
      easing: pickString(
        playback.easing,
        ["linear", "easeInOut", "easeOut", "impact", "breath"] as const,
        fallback.playback.easing,
      ),
      intensity: clampNumber(
        playback.intensity,
        fallback.playback.intensity,
        0,
        1,
      ),
    },
    motionIntent: {
      ...motionIntent,
      directionHint,
    },
  };
}
