import type { CdtCategory } from "./edge-cdt-animation";
import type {
  GenerativeMotionPlan,
  MotionOperation,
  MotionPlanContext,
  MotionTarget,
} from "./generative-motion-plan";
import { buildRunRightMotionTemplate } from "./motion-templates";

export const DIRECTION_HINTS = [
  "right",
  "left",
  "auto",
  "unknown",
] as const;

export type DirectionHint = (typeof DIRECTION_HINTS)[number];

export const MOTION_STYLES = [
  "run",
  "fight",
  "dance",
  "wave",
  "reach",
  "speak",
  "idle",
] as const;

export type MotionStyle = (typeof MOTION_STYLES)[number];

export type DominantSide = "left" | "right" | "both" | "none";

export type MotionIntent = {
  style: MotionStyle;
  energy?: number;
  dominantSide?: DominantSide;
  tempo?: "slow" | "normal" | "fast";
  symmetry?: "mirror" | "offset" | "asymmetric";
  contactEmphasis?: boolean;
  directionHint?: DirectionHint;
};

export type MotionPlanValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type MotionPlanValidationResult = {
  ok: boolean;
  errors: MotionPlanValidationIssue[];
  warnings: MotionPlanValidationIssue[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeDirectionHint(value: unknown): DirectionHint {
  if (typeof value !== "string") return "auto";
  const token = value.trim().toLowerCase();
  if (token === "right" || token === "sourcetotargetright") return "right";
  if (token === "left" || token === "sourcetotargetleft") return "left";
  if (token === "unknown") return "unknown";
  return "auto";
}

export function parseMotionIntent(raw: unknown): MotionIntent | undefined {
  if (!isRecord(raw)) return undefined;
  const styleRaw = typeof raw.style === "string" ? raw.style.toLowerCase() : "";
  if (!MOTION_STYLES.includes(styleRaw as MotionStyle)) return undefined;
  const dominantRaw =
    typeof raw.dominantSide === "string" ? raw.dominantSide.toLowerCase() : undefined;
  const tempoRaw = typeof raw.tempo === "string" ? raw.tempo.toLowerCase() : undefined;
  const symmetryRaw =
    typeof raw.symmetry === "string" ? raw.symmetry.toLowerCase() : undefined;

  return {
    style: styleRaw as MotionStyle,
    ...(typeof raw.energy === "number"
      ? { energy: Math.min(1, Math.max(0, raw.energy)) }
      : {}),
    ...(dominantRaw === "left" ||
    dominantRaw === "right" ||
    dominantRaw === "both" ||
    dominantRaw === "none"
      ? { dominantSide: dominantRaw }
      : {}),
    ...(tempoRaw === "slow" || tempoRaw === "normal" || tempoRaw === "fast"
      ? { tempo: tempoRaw }
      : {}),
    ...(symmetryRaw === "mirror" ||
    symmetryRaw === "offset" ||
    symmetryRaw === "asymmetric"
      ? { symmetry: symmetryRaw }
      : {}),
    ...(typeof raw.contactEmphasis === "boolean"
      ? { contactEmphasis: raw.contactEmphasis }
      : {}),
    ...(raw.directionHint != null
      ? { directionHint: normalizeDirectionHint(raw.directionHint) }
      : {}),
  };
}

export function inferMotionStyle(
  category: CdtCategory,
  predicate: string,
): MotionStyle {
  const key = predicate.trim().toUpperCase();
  if (/^(ATTACKED|FOUGHT|AFFECTED_BY|STRIKED|DEFEATED|CRITICIZED)/.test(key)) {
    return "fight";
  }
  if (/^(DANCED|DANCED_WITH|PERFORMED)/.test(key)) {
    return "dance";
  }
  if (/^(WAVED|WAVED_TO|SHOOK)/.test(key)) {
    return "wave";
  }
  if (
    /^(PARTICIPATED|VISITED|APPROACHED|MOVED|TRAVELED|LOCATED|CONNECTS|COLLABORAT)/.test(
      key,
    )
  ) {
    return "run";
  }
  if (category === "PROPEL") return "fight";
  if (category === "SPEAK") return "speak";
  if (category === "MOVE" || category === "PTRANS") return "run";
  if (category === "ATRANS") return "reach";
  return "idle";
}

export function resolveMotionIntent(
  raw: unknown,
  category: CdtCategory,
  predicate: string,
  context?: MotionPlanContext,
): MotionIntent {
  const fromRaw =
    parseMotionIntent(raw) ??
    (isRecord(raw) && isRecord(raw.semantic)
      ? parseMotionIntent(raw.semantic.motionIntent)
      : undefined) ??
    (isRecord(raw) ? parseMotionIntent(raw.motionIntent) : undefined);

  const directionHint =
    context?.directionHint ??
    fromRaw?.directionHint ??
    "auto";

  if (fromRaw) {
    return { ...fromRaw, directionHint };
  }

  return {
    style: inferMotionStyle(category, predicate),
    energy: 0.6,
    dominantSide: directionHint === "left" ? "left" : "right",
    tempo: "normal",
    symmetry: "offset",
    directionHint,
  };
}

function flipKeyframeSign(kf: {
  contact: number;
  down: number;
  pass: number;
  up: number;
}) {
  return {
    contact: -kf.contact,
    down: -kf.down,
    pass: -kf.pass,
    up: -kf.up,
  };
}

function mirrorRotationOp(op: MotionOperation): MotionOperation {
  if (op.type !== "rotation") return op;
  const mirrored: MotionOperation = { ...op };
  if (mirrored.fromDegrees != null) mirrored.fromDegrees = -mirrored.fromDegrees;
  if (mirrored.toDegrees != null) mirrored.toDegrees = -mirrored.toDegrees;
  if (mirrored.degrees != null) mirrored.degrees = mirrored.degrees;
  if (mirrored.keyframes) {
    mirrored.keyframes = flipKeyframeSign(mirrored.keyframes);
  }
  return mirrored;
}

/** 左向き走行: 角度符号を反転（human-runner-right SVG は同一アセットで鏡像パラメータ） */
export function applyDirectionHintToOperations(
  operations: MotionOperation[],
  directionHint: DirectionHint,
  assetId?: string,
): MotionOperation[] {
  if (directionHint !== "left") return operations;
  if (assetId && assetId !== "human-runner-right") return operations;
  return operations.map((op) => {
    if (op.type === "rotation" && op.target.startsWith("human.")) {
      return mirrorRotationOp(op);
    }
    if (
      op.type === "rotation" &&
      op.target === "human.body" &&
      op.keyframes
    ) {
      return mirrorRotationOp(op);
    }
    return op;
  });
}

export function dominantArmTarget(side: DominantSide): MotionTarget {
  return side === "left" ? "human.leftArm" : "human.rightArm";
}

export function mergeRunTemplateIntoPlan(
  plan: GenerativeMotionPlan,
  predicate: string,
  context?: MotionPlanContext,
): GenerativeMotionPlan {
  const template = buildRunRightMotionTemplate(
    predicate,
    context?.sourceName,
    context?.targetName,
  );
  const directionHint = context?.directionHint ?? "right";
  const operations = applyDirectionHintToOperations(
    template.recipe.operations,
    directionHint === "auto" ? "right" : directionHint,
    template.asset.assetId,
  );

  return {
    ...plan,
    semantic: {
      ...plan.semantic,
      ...template.semantic,
      cdtCategory: plan.semantic.cdtCategory,
      predicate: plan.semantic.predicate || predicate,
    },
    participants: { ...plan.participants, ...template.participants },
    asset: { ...template.asset },
    recipe: {
      preset: "bodyPartMotion",
      operations,
    },
    playback: { ...template.playback, ...plan.playback },
    motionIntent: {
      style: "run",
      energy: plan.playback.intensity,
      dominantSide: directionHint === "left" ? "left" : "right",
      directionHint,
    },
  };
}

export function humanPartCount(plan: GenerativeMotionPlan): number {
  return new Set(
    plan.recipe.operations
      .map((op) => op.target)
      .filter((t) => t.startsWith("human.")),
  ).size;
}

export function hasHumanHead(plan: GenerativeMotionPlan): boolean {
  return plan.recipe.operations.some((op) => op.target === "human.head");
}

export function validateHumanMotionPlan(
  plan: GenerativeMotionPlan,
  context?: MotionPlanContext,
): MotionPlanValidationResult {
  const errors: MotionPlanValidationIssue[] = [];
  const warnings: MotionPlanValidationIssue[] = [];
  const intent = plan.motionIntent ?? resolveMotionIntent(
    plan,
    plan.semantic.cdtCategory,
    plan.semantic.predicate,
    context,
  );

  if (plan.asset.kind === "human") {
    if (!hasHumanHead(plan)) {
      errors.push({
        code: "missing_head",
        message: "human asset requires at least one human.head operation",
        severity: "error",
      });
    }
    const parts = humanPartCount(plan);
    if (parts < 3) {
      errors.push({
        code: "sparse_human_parts",
        message: `human asset should articulate at least 3 body parts (found ${parts})`,
        severity: "error",
      });
    } else if (parts < 4 && (intent.style === "dance" || intent.style === "fight")) {
      warnings.push({
        code: "complex_motion_sparse",
        message: `${intent.style} motion works better with 4+ body parts`,
        severity: "warning",
      });
    }

    const opCount = plan.recipe.operations.length;
    if (opCount < 3 || opCount > 16) {
      errors.push({
        code: "operation_count",
        message: `operations count must be 3..16 (found ${opCount})`,
        severity: "error",
      });
    }
  }

  if (intent.style === "fight" && plan.asset.kind === "human") {
    const hasImpactArm = plan.recipe.operations.some(
      (op) =>
        op.type === "rotation" &&
        (op.target === "human.rightArm" || op.target === "human.leftArm") &&
        (op.easing === "impact" ||
          Math.abs(op.toDegrees ?? op.degrees ?? 0) >= 28),
    );
    if (!hasImpactArm) {
      warnings.push({
        code: "fight_weak_arm",
        message: "fight style expects a dominant arm rotation with impact or wide angle",
        severity: "warning",
      });
    }
    const hasEffect = plan.recipe.operations.some(
      (op) =>
        op.role === "effect" ||
        op.target === "edgeGlyph" ||
        op.type === "scale",
    );
    if (!hasEffect) {
      warnings.push({
        code: "fight_no_effect",
        message: "fight style expects an edgeGlyph or scale effect",
        severity: "warning",
      });
    }
  }

  if (intent.style === "dance" && plan.asset.kind === "human") {
    const looping = plan.recipe.operations.filter(
      (op) => op.repeat === "loop" || op.repeat === "yoyo",
    ).length;
    if (looping < 2) {
      warnings.push({
        code: "dance_not_looping",
        message: "dance style expects multiple looping/yoyo limb operations",
        severity: "warning",
      });
    }
    const phased = plan.recipe.operations.filter(
      (op) => op.phase != null && op.phase > 0,
    ).length;
    if (phased < 1) {
      warnings.push({
        code: "dance_no_phase_offset",
        message: "dance style benefits from phase offsets between limbs",
        severity: "warning",
      });
    }
  }

  if (intent.style === "run" && plan.asset.kind === "human") {
    const hasLegs = ["human.leftLeg", "human.rightLeg"].every((t) =>
      plan.recipe.operations.some((op) => op.target === t),
    );
    if (!hasLegs) {
      warnings.push({
        code: "run_missing_legs",
        message: "run style expects both leg rotations",
        severity: "warning",
      });
    }
  }

  const directionHint = context?.directionHint ?? intent.directionHint ?? "auto";
  if (
    directionHint === "right" &&
    intent.style === "run" &&
    plan.asset.assetId === "human-runner-right"
  ) {
    const bodyLean = plan.recipe.operations.find(
      (op) => op.type === "rotation" && op.target === "human.body",
    );
    if (
      bodyLean?.type === "rotation" &&
      bodyLean.keyframes &&
      bodyLean.keyframes.contact < 0
    ) {
      warnings.push({
        code: "direction_lean_mismatch",
        message: "right directionHint but body lean keyframes appear left-oriented",
        severity: "warning",
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
