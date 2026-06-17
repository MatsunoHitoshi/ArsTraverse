"use client";

import React from "react";
import type {
  CdtCategory,
  EdgeMotionConfig,
  EdgeMotionType,
} from "@/app/const/edge-cdt-animation";
import type {
  GenerativeMotionPlan,
  MotionOperation,
  MotionOperationRepeat,
  MotionTarget,
} from "@/app/const/generative-motion-plan";

// ---------------------------------------------------------------------------
// PictogramRenderer 差し替えインターフェース
// ---------------------------------------------------------------------------

export type PictogramRendererProps = {
  /** CDTカテゴリ・色・速度などのアニメーション設定 */
  config: EdgeMotionConfig;
  /** 描画領域のサイズ（px）: foreignObject の width/height に使用 */
  size: number;
};

// ---------------------------------------------------------------------------
// CDTカテゴリ別インラインSVGアイコン（外部ライブラリ不要）
// ---------------------------------------------------------------------------

const CDT_ICONS: Record<
  CdtCategory,
  React.FC<{ size: number; color: string }>
> = {
  // PTRANS: 矢印（移動）
  PTRANS: ({ size, color }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  // ATRANS: 手のひら（渡す）
  ATRANS: ({ size, color }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  ),
  // PROPEL: 剣（攻撃・衝突）
  PROPEL: ({ size, color }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" y1="19" x2="19" y2="13" />
      <line x1="16" y1="16" x2="20" y2="20" />
      <line x1="19" y1="21" x2="21" y2="19" />
    </svg>
  ),
  // MOVE: 波線（接触・アプローチ）
  MOVE: ({ size, color }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12c1.5-3 3-4.5 4.5-4.5S9 9 10.5 9s3-3 4.5-3S18 8.5 19.5 9 22 12 22 12" />
    </svg>
  ),
  // INGEST: 収束矢印（吸収・合併）
  INGEST: ({ size, color }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  // EXPEL: 放射矢印（分離・放出）
  EXPEL: ({ size, color }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" />
      <path d="M7 12h14l-3-3m0 6 3-3" />
    </svg>
  ),
  // SPEAK: 吹き出し（発言・宣言）
  SPEAK: ({ size, color }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  // MENTAL: 電球（認知・推測）
  MENTAL: ({ size, color }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="10" y1="22" x2="14" y2="22" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Case 1: IconPictogramRenderer（インラインSVGアイコン + CSS アニメ）
// ---------------------------------------------------------------------------

const MOTION_ANIMATION_STYLE: Record<
  EdgeMotionType,
  (durationMs: number) => React.CSSProperties
> = {
  flow: (d) => ({
    animation: `edge-motion-flow ${d}ms linear infinite`,
  }),
  extend: (d) => ({
    animation: `edge-motion-extend ${d}ms ease-in-out infinite`,
  }),
  "pulse-impact": (d) => ({
    animation: `edge-motion-impact ${d}ms ease-in-out infinite`,
  }),
  wave: (d) => ({
    animation: `edge-motion-wave ${d}ms ease-in-out infinite`,
  }),
  converge: (d) => ({
    animation: `edge-motion-converge ${d}ms ease-in-out infinite`,
  }),
  diverge: (d) => ({
    animation: `edge-motion-diverge ${d}ms ease-in-out infinite`,
  }),
  pop: (d) => ({
    animation: `edge-motion-pop ${d}ms ease-out infinite`,
  }),
  glow: (d) => ({
    animation: `edge-motion-glow ${d}ms ease-in-out infinite`,
  }),
};

/**
 * 案1: インラインSVGアイコン + CSS アニメーションによるデフォルト実装。
 * `<foreignObject>` 経由でReactコンポーネントをSVG上に配置する。
 */
export function IconPictogramRenderer({
  config,
  size,
}: PictogramRendererProps) {
  const IconSvg = CDT_ICONS[config.category];
  const iconSize = Math.round(size * 0.55);
  const animStyle = MOTION_ANIMATION_STYLE[config.motionType](
    config.durationMs,
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: `${config.color}22`,
        border: `1.5px solid ${config.color}88`,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          ...animStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {IconSvg ? (
          <IconSvg size={iconSize} color={config.color} />
        ) : (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke={config.color}
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="4" />
          </svg>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Case 2: BodyPartsPictogramRenderer（パーツ分割SVG + motionPlan）
// ---------------------------------------------------------------------------

const HUMAN_PART_TARGETS = [
  "human.head",
  "human.body",
  "human.leftArm",
  "human.rightArm",
  "human.leftLeg",
  "human.rightLeg",
] as const;

type HumanPartTarget = (typeof HUMAN_PART_TARGETS)[number];

type MotionStyle = React.CSSProperties &
  Partial<Record<`--${string}`, string | number>>;

const EASING_BY_PLAN: Record<
  GenerativeMotionPlan["playback"]["easing"],
  string
> = {
  linear: "linear",
  easeInOut: "ease-in-out",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  impact: "cubic-bezier(0.2, 0.9, 0.2, 1.15)",
  breath: "ease-in-out",
};

type RunCycle4PhaseKeyframes = {
  contact: number;
  down: number;
  pass: number;
  up: number;
};

/** 4-phase 区間ごとに 4 分割 → 16 点。各区間内は cosine ease でサンプルし C1 連続に近づける。 */
const RUN_CYCLE_STEPS_PER_QUARTER = 4;

function sampleSmoothRunCycle4Phase(kf: RunCycle4PhaseKeyframes): number[] {
  const anchors = [kf.contact, kf.down, kf.pass, kf.up];
  const samples: number[] = [];
  for (let i = 0; i < RUN_CYCLE_STEPS_PER_QUARTER * 4; i++) {
    const seg = Math.floor(i / RUN_CYCLE_STEPS_PER_QUARTER) % 4;
    const local = (i % RUN_CYCLE_STEPS_PER_QUARTER) / RUN_CYCLE_STEPS_PER_QUARTER;
    const from = anchors[seg]!;
    const to = anchors[(seg + 1) % 4]!;
    const eased = (1 - Math.cos(Math.PI * local)) / 2;
    samples.push(from + (to - from) * eased);
  }
  return samples;
}

function runCycle16CssVars(
  samples: number[],
  prefix: string,
  format: (value: number) => string,
): Partial<Record<`--${string}`, string>> {
  const vars: Partial<Record<`--${string}`, string>> = {};
  samples.forEach((value, index) => {
    vars[`--${prefix}-${String(index).padStart(2, "0")}`] = format(value);
  });
  return vars;
}

type RotationOrigin = "center" | "shoulder" | "hip" | "neck" | "custom";

const TRANSFORM_ORIGIN_BY_PART: Record<HumanPartTarget, string> = {
  "human.head": "50% 100%",
  "human.body": "50% 0%",
  "human.leftArm": "100% 0%",
  "human.rightArm": "0% 0%",
  "human.leftLeg": "100% 0%",
  "human.rightLeg": "0% 0%",
};

function transformOriginForPart(
  target: HumanPartTarget,
  origin: RotationOrigin | undefined,
): string {
  if (!origin || origin === "center" || origin === "custom") {
    return TRANSFORM_ORIGIN_BY_PART[target];
  }
  if (origin === "shoulder") {
    if (target === "human.leftArm") return "100% 0%";
    if (target === "human.rightArm") return "0% 0%";
    if (target === "human.body") return "50% 0%";
  }
  if (origin === "hip") {
    if (target === "human.leftLeg") return "100% 0%";
    if (target === "human.rightLeg") return "0% 0%";
    if (target === "human.body") return "50% 100%";
  }
  if (origin === "neck") {
    if (target === "human.head") return "50% 100%";
    if (target === "human.body") return "50% 0%";
  }
  return TRANSFORM_ORIGIN_BY_PART[target];
}

function hasHumanTargets(plan: GenerativeMotionPlan | undefined): boolean {
  return !!plan?.recipe.operations.some((operation) =>
    operation.target.startsWith("human."),
  );
}

function operationForTarget(
  plan: GenerativeMotionPlan,
  target: MotionTarget,
  filter?: (op: MotionOperation) => boolean,
): MotionOperation | undefined {
  const roleRank: Record<NonNullable<MotionOperation["role"]>, number> = {
    action: 5,
    effect: 4,
    reaction: 3,
    anticipation: 2,
    idle: 1,
  };
  return plan.recipe.operations
    .filter((operation) => operation.target === target)
    .filter((operation) => (filter ? filter(operation) : true))
    .sort(
      (a, b) =>
        (roleRank[b.role ?? "action"] ?? 0) -
        (roleRank[a.role ?? "action"] ?? 0),
    )[0];
}

function isContinuousBodyMotion(operation: MotionOperation): boolean {
  const isContinuousType =
    operation.type === "rotation" || operation.type === "pathMovement";
  const isBodyPart = operation.target.startsWith("human.");
  return isContinuousType && isBodyPart;
}

function effectiveRepeat(
  plan: GenerativeMotionPlan,
  operation: MotionOperation,
): MotionOperationRepeat {
  const explicit = operation.repeat;
  if (explicit && explicit !== "once") return explicit;
  if (
    explicit === "once" &&
    operation.type === "rotation" &&
    operation.role === "effect" &&
    operation.target.startsWith("human.")
  ) {
    return "once";
  }

  if (isContinuousBodyMotion(operation) && plan.playback.loop) {
    return plan.playback.yoyo ? "yoyo" : "loop";
  }
  return (
    explicit ?? (plan.playback.yoyo ? "yoyo" : plan.playback.loop ? "loop" : "once")
  );
}

function operationPlaybackStyle(
  plan: GenerativeMotionPlan,
  operation: MotionOperation,
): MotionStyle {
  const fullDurationMs = Math.max(500, plan.playback.durationMs);
  const timingStart = operation.timing?.start ?? operation.phase ?? 0;
  const timingDuration = operation.timing?.duration ?? 1;
  const durationMs = Math.max(120, fullDurationMs * timingDuration);
  const delayMs =
    (plan.playback.delayMs ?? 0) +
    fullDurationMs * timingStart -
    durationMs * (operation.phase ?? 0);
  const repeat = effectiveRepeat(plan, operation);

  return {
    animationDuration: `${durationMs}ms`,
    animationDelay: `${delayMs}ms`,
    animationTimingFunction:
      EASING_BY_PLAN[operation.easing ?? plan.playback.easing],
    animationIterationCount: repeat === "once" ? 1 : "infinite",
    animationFillMode: "both",
    animationDirection: repeat === "yoyo" ? "alternate" : "normal",
  };
}

function partMotionStyle(
  plan: GenerativeMotionPlan,
  target: HumanPartTarget,
  filter?: (op: MotionOperation) => boolean,
): MotionStyle | undefined {
  const operation = operationForTarget(plan, target, filter);
  if (!operation) return undefined;

  const originOverride =
    operation.type === "rotation"
      ? (operation.origin as RotationOrigin | undefined)
      : undefined;
  const common: MotionStyle = {
    transformBox: "fill-box",
    transformOrigin: transformOriginForPart(target, originOverride),
    ...operationPlaybackStyle(plan, operation),
  };

  switch (operation.type) {
    case "rotation": {
      const i = Math.max(0.25, plan.playback.intensity);
      if (operation.keyframes) {
        const samples = sampleSmoothRunCycle4Phase(operation.keyframes).map(
          (value) => value * i,
        );
        return {
          ...common,
          animationName: "body-part-rotate-16phase",
          animationTimingFunction: "linear",
          ...runCycle16CssVars(samples, "motion-r", (value) => `${value}deg`),
        };
      }
      const fromDegrees =
        (operation.fromDegrees ?? -operation.degrees) * i;
      const toDegrees =
        (operation.toDegrees ?? operation.degrees) * i;
      return {
        ...common,
        animationName: "body-part-rotate-yoyo",
        "--motion-rotate-from": `${fromDegrees}deg`,
        "--motion-rotate-to": `${toDegrees}deg`,
      };
    }
    case "pathMovement": {
      const intensity = Math.max(0.5, plan.playback.intensity);
      const isBody = target === "human.body";
      const isVertical = operation.path === "jitter" || isBody;
      if (operation.keyframes) {
        const amp = isBody ? 2.5 : 1;
        const samples = sampleSmoothRunCycle4Phase(operation.keyframes).map(
          (value) => value * amp * intensity,
        );
        return {
          ...common,
          animationName: "body-part-translate-16phase",
          animationTimingFunction: "linear",
          ...runCycle16CssVars(samples, "motion-ty", (value) => `${value}px`),
        };
      }
      const targetAmplifier = isBody ? 2.5 : 1;
      const minOffset = isBody ? 4 : 0;
      const rawFrom =
        (operation.fromOffset ?? -operation.amplitude) * intensity;
      const rawTo = (operation.toOffset ?? operation.amplitude) * intensity;
      const fromOffset =
        Math.sign(rawFrom || -1) *
        Math.max(Math.abs(rawFrom) * targetAmplifier, minOffset);
      const toOffset =
        Math.sign(rawTo || 1) *
        Math.max(Math.abs(rawTo) * targetAmplifier, minOffset);
      return {
        ...common,
        animationName: "body-part-translate-yoyo",
        "--motion-translate-x-from": isVertical ? "0px" : `${fromOffset}px`,
        "--motion-translate-y-from": isVertical ? `${fromOffset}px` : "0px",
        "--motion-translate-x-to": isVertical ? "0px" : `${toOffset}px`,
        "--motion-translate-y-to": isVertical ? `${toOffset}px` : "0px",
      };
    }
    case "scale":
      return {
        ...common,
        animationName: "body-part-scale-yoyo",
        "--motion-scale-from": operation.from,
        "--motion-scale-to": operation.to,
      };
    case "flip":
      return {
        ...common,
        animationName:
          operation.axis === "y"
            ? "body-part-flip-y-yoyo"
            : "body-part-flip-x-yoyo",
      };
    case "appearance":
      return {
        ...common,
        animationName:
          operation.mode === "fade"
            ? "body-part-fade-yoyo"
            : "body-part-pop-yoyo",
      };
    case "disappearance":
      return {
        ...common,
        animationName: "body-part-vanish-yoyo",
      };
    default:
      return undefined;
  }
}

type FlexJoint = "elbow" | "knee";

/**
 * 親パート（肩/腰の回転）に同期した内側関節（肘/膝）の小屈曲スタイル。
 * 親と同じ animation-duration/delay を使い、振幅だけ小さく逆位相気味にして
 * 自然な肘曲げ/膝曲げの相対モーションを生む。
 */
function flexStyle(
  plan: GenerativeMotionPlan,
  parentTarget: HumanPartTarget,
  joint: FlexJoint,
  pivotOrigin: string,
): MotionStyle {
  const explicitFlexOperation = operationForTarget(
    plan,
    parentTarget,
    (op) => op.type === "rotation" && op.role === "effect",
  );
  const operation =
    explicitFlexOperation ??
    operationForTarget(plan, parentTarget, (op) => op.type === "rotation");
  const baseStatic: MotionStyle = {
    transformBox: "fill-box",
    transformOrigin: pivotOrigin,
    transform: joint === "elbow" ? "rotate(8deg)" : "rotate(6deg)",
  };
  if (!operation || operation.type !== "rotation") return baseStatic;

  const intensity = Math.max(0.3, plan.playback.intensity);
  const flexFactor = explicitFlexOperation ? 1 : 0.45 * intensity;
  const fromDeg =
    (operation.fromDegrees ?? -(operation.degrees ?? 12)) * flexFactor;
  const toDeg = (operation.toDegrees ?? operation.degrees ?? 12) * flexFactor;

  if (explicitFlexOperation && operation.keyframes) {
    const samples = sampleSmoothRunCycle4Phase(operation.keyframes).map(
      (value) => value * intensity,
    );
    return {
      transformBox: "fill-box",
      transformOrigin: pivotOrigin,
      ...operationPlaybackStyle(plan, operation),
      animationName: "body-part-flex-16phase",
      animationTimingFunction: "linear",
      ...runCycle16CssVars(samples, "motion-flex", (value) =>
        `${value.toFixed(1)}deg`,
      ),
    };
  }

  return {
    transformBox: "fill-box",
    transformOrigin: pivotOrigin,
    ...operationPlaybackStyle(plan, operation),
    animationName: "body-part-flex-yoyo",
    "--motion-flex-from": explicitFlexOperation
      ? `${fromDeg.toFixed(1)}deg`
      : `${(-fromDeg).toFixed(1)}deg`,
    "--motion-flex-to": explicitFlexOperation
      ? `${toDeg.toFixed(1)}deg`
      : `${(-toDeg).toFixed(1)}deg`,
  };
}

function HumanBodyPartsSvg({
  config,
  size,
  plan,
}: {
  config: EdgeMotionConfig;
  size: number;
  plan: GenerativeMotionPlan;
}) {
  const strokeWidth = 2.6;
  const color = config.color;
  const fillSoft = `${color}22`;
  const accentSoft = `${color}55`;

  if (plan.asset.assetId === "human-runner-right") {
    return (
      <HumanRunnerRightSvg
        config={config}
        size={size}
        plan={plan}
        strokeWidth={strokeWidth}
        fillSoft={fillSoft}
        accentSoft={accentSoft}
      />
    );
  }

  // 外側ラッパーは body の pathMovement だけを受け持ち、全パーツを一体で bob させる。
  // 内側の body グループは rotation/scale (体幹リーン・伸縮) のみを担当する。
  const figureBobStyle = partMotionStyle(
    plan,
    "human.body",
    (op) => op.type === "pathMovement",
  );
  const bodyArticulationStyle = partMotionStyle(
    plan,
    "human.body",
    (op) => op.type === "rotation" || op.type === "scale",
  );
  const skeletonArticulationStyle: MotionStyle | undefined = bodyArticulationStyle
    ? {
        ...bodyArticulationStyle,
        transformBox: "view-box",
        transformOrigin: "32px 44px",
      }
    : undefined;

  return (
    <svg
      data-motion-component="HumanBodyPartsSvg"
      data-testid="motion-human-svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      overflow="visible"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      aria-hidden="true"
    >
      <g
        data-motion-wrapper="figureBob"
        data-motion-role="figureBob"
        style={figureBobStyle}
      >
      <g
        data-motion-wrapper="bodyArticulation"
        data-motion-role="bodyArticulation"
        style={skeletonArticulationStyle}
      >
      <g
        data-motion-target="human.body"
        data-motion-role="torso"
        data-testid="motion-part-human-body"
      >
        <path
          d="M32 25 C31 30 31 37 32 44"
          stroke={color}
          strokeWidth={4.2}
        />
        <line
          x1="27.6"
          y1="28"
          x2="36.4"
          y2="28"
          stroke={accentSoft}
          strokeWidth={1.2}
        />
        <line
          x1="27.6"
          y1="42"
          x2="36.4"
          y2="42"
          stroke={accentSoft}
          strokeWidth={1.2}
        />
        <line x1="32" y1="25" x2="32" y2="28" />
      </g>

      <g
        data-motion-target="human.head"
        data-motion-role="head"
        data-testid="motion-part-human-head"
        style={partMotionStyle(plan, "human.head")}
      >
        <circle cx="32" cy="16" r="7.5" fill={fillSoft} />
        <line x1="32" y1="23.5" x2="32" y2="25.2" />
        <circle cx="30" cy="15.5" r="0.9" fill={color} stroke="none" />
        <circle cx="34" cy="15.5" r="0.9" fill={color} stroke="none" />
        <path d="M29.6 19 Q32 20.2 34.4 19" strokeWidth={1.6} />
      </g>

      {/* Left arm: shoulder rotation drives upper segment; elbow flex drives forearm */}
      <g
        data-motion-target="human.leftArm"
        data-motion-role="upperArm"
        data-testid="motion-part-human-leftArm"
        style={partMotionStyle(plan, "human.leftArm")}
      >
        <line x1="29.5" y1="28" x2="24" y2="35.5" />
        <circle
          cx="24"
          cy="35.5"
          r="1.4"
          fill={fillSoft}
          stroke={accentSoft}
          strokeWidth={1.2}
        />
        <g
          data-motion-target="human.leftArm"
          data-motion-joint="leftElbow"
          data-motion-role="forearm"
          data-testid="motion-joint-leftElbow"
          style={flexStyle(plan, "human.leftArm", "elbow", "100% 0%")}
        >
          <line x1="24" y1="35.5" x2="18.5" y2="43" />
          <circle cx="18" cy="43.5" r="2" fill={fillSoft} />
        </g>
      </g>

      {/* Right arm */}
      <g
        data-motion-target="human.rightArm"
        data-motion-role="upperArm"
        data-testid="motion-part-human-rightArm"
        style={partMotionStyle(plan, "human.rightArm")}
      >
        <line x1="34.5" y1="28" x2="40" y2="35.5" />
        <circle
          cx="40"
          cy="35.5"
          r="1.4"
          fill={fillSoft}
          stroke={accentSoft}
          strokeWidth={1.2}
        />
        <g
          data-motion-target="human.rightArm"
          data-motion-joint="rightElbow"
          data-motion-role="forearm"
          data-testid="motion-joint-rightElbow"
          style={flexStyle(plan, "human.rightArm", "elbow", "0% 0%")}
        >
          <line x1="40" y1="35.5" x2="45.5" y2="43" />
          <circle cx="46" cy="43.5" r="2" fill={fillSoft} />
        </g>
      </g>

      {/* Left leg: hip rotation drives thigh; knee flex drives shin */}
      <g
        data-motion-target="human.leftLeg"
        data-motion-role="thigh"
        data-testid="motion-part-human-leftLeg"
        style={partMotionStyle(plan, "human.leftLeg")}
      >
        <line x1="30.5" y1="42.5" x2="27" y2="50" />
        <circle
          cx="27"
          cy="50"
          r="1.6"
          fill={fillSoft}
          stroke={accentSoft}
          strokeWidth={1.2}
        />
        <g
          data-motion-target="human.leftLeg"
          data-motion-joint="leftKnee"
          data-motion-role="shin"
          data-testid="motion-joint-leftKnee"
          style={flexStyle(plan, "human.leftLeg", "knee", "100% 0%")}
        >
          <line x1="27" y1="50" x2="23" y2="59" />
          <ellipse cx="22" cy="60" rx="3" ry="1.4" fill={fillSoft} />
        </g>
      </g>

      {/* Right leg */}
      <g
        data-motion-target="human.rightLeg"
        data-motion-role="thigh"
        data-testid="motion-part-human-rightLeg"
        style={partMotionStyle(plan, "human.rightLeg")}
      >
        <line x1="33.5" y1="42.5" x2="37" y2="50" />
        <circle
          cx="37"
          cy="50"
          r="1.6"
          fill={fillSoft}
          stroke={accentSoft}
          strokeWidth={1.2}
        />
        <g
          data-motion-target="human.rightLeg"
          data-motion-joint="rightKnee"
          data-motion-role="shin"
          data-testid="motion-joint-rightKnee"
          style={flexStyle(plan, "human.rightLeg", "knee", "0% 0%")}
        >
          <line x1="37" y1="50" x2="41" y2="59" />
          <ellipse cx="42" cy="60" rx="3" ry="1.4" fill={fillSoft} />
        </g>
      </g>
      </g>
      </g>
    </svg>
  );
}

function HumanRunnerRightSvg({
  config,
  size,
  plan,
  strokeWidth,
  fillSoft,
  accentSoft,
}: {
  config: EdgeMotionConfig;
  size: number;
  plan: GenerativeMotionPlan;
  strokeWidth: number;
  fillSoft: string;
  accentSoft: string;
}) {
  const color = config.color;
  // 全身を bob させる外側ラッパー（human.body の pathMovement のみ）。
  const figureBobStyle = partMotionStyle(
    plan,
    "human.body",
    (op) => op.type === "pathMovement",
  );
  // 骨格全体を腰ピボットで右へ前傾させる（human.body の rotation/scale）。
  const bodyArticulationStyle = partMotionStyle(
    plan,
    "human.body",
    (op) => op.type === "rotation" || op.type === "scale",
  );
  // transform-box: view-box の transform-origin は viewport (CSS px) 基準なので、
  // viewBox 座標を直接書くと意図と一致しない。パーセントなら viewBox に対して
  // スケール不変に hip / shoulder を指せる。
  //   hip      = viewBox (32, 43) ⇒ (32/64, 43/64) = (50%, 67.1875%)
  //   shoulder = viewBox (32, 27) ⇒ (32/64, 27/64) = (50%, 42.1875%)
  const HIP_ORIGIN = "50% 67.1875%";
  const SHOULDER_ORIGIN = "50% 42.1875%";

  const skeletonArticulationStyle: MotionStyle | undefined =
    bodyArticulationStyle
      ? {
          ...bodyArticulationStyle,
          transformBox: "view-box",
          transformOrigin: HIP_ORIGIN,
        }
      : undefined;

  // 肩・股のピボットを viewBox 座標で固定して、左右どちら向きに腕脚を伸ばしても
  // 一貫してその点を中心に前後（画面右左）へ回転する。
  const armPivotStyle = (target: "human.leftArm" | "human.rightArm") => {
    const base = partMotionStyle(plan, target);
    if (!base) return undefined;
    return {
      ...base,
      transformBox: "view-box",
      transformOrigin: SHOULDER_ORIGIN,
    } satisfies MotionStyle;
  };
  const legPivotStyle = (target: "human.leftLeg" | "human.rightLeg") => {
    const base = partMotionStyle(plan, target);
    if (!base) return undefined;
    return {
      ...base,
      transformBox: "view-box",
      transformOrigin: HIP_ORIGIN,
    } satisfies MotionStyle;
  };

  return (
    <svg
      data-motion-component="HumanRunnerRightSvg"
      data-testid="motion-human-svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      overflow="visible"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible" }}
      aria-hidden="true"
    >
      <g
        data-motion-wrapper="figureBob"
        data-motion-role="figureBob"
        data-testid="motion-figure-bob"
        style={figureBobStyle}
      >
        <g
          data-motion-wrapper="bodyArticulation"
          data-motion-role="bodyArticulation"
          style={skeletonArticulationStyle}
        >
          {/* 胴体 (脊椎): 肩 (32,27) から腰 (32,43) への垂直スパイン。
              骨格全体の rotation が右傾を作るので、ここでは個別 rotation を持たない。 */}
          <g
            data-motion-target="human.body"
            data-motion-role="torso"
            data-testid="motion-part-human-body"
          >
            <line
              x1="32"
              y1="25.5"
              x2="32"
              y2="43"
              stroke={color}
              strokeWidth={4.4}
            />
            <line
              x1="29"
              y1="27"
              x2="35"
              y2="27"
              stroke={accentSoft}
              strokeWidth={1.2}
            />
            <line
              x1="29"
              y1="43"
              x2="35"
              y2="43"
              stroke={accentSoft}
              strokeWidth={1.2}
            />
          </g>

          {/* 脚 → 腕 → 頭 の順で描画 (サイドビューで前側パーツが上に来る) */}
          {/* 左脚 (後ろ脚: 画面左へ伸びる)。腰 (32,43) を支点に前後に振る。 */}
          <g
            data-motion-target="human.leftLeg"
            data-motion-role="thigh"
            data-testid="motion-part-human-leftLeg"
            style={legPivotStyle("human.leftLeg")}
          >
            <line x1="32" y1="43" x2="29" y2="53.5" />
            <circle
              cx="29"
              cy="53.5"
              r="1.6"
              fill={fillSoft}
              stroke={accentSoft}
              strokeWidth={1.2}
            />
            <g
              data-motion-target="human.leftLeg"
              data-motion-joint="leftKnee"
              data-motion-role="shin"
              data-testid="motion-joint-leftKnee"
              style={flexStyle(plan, "human.leftLeg", "knee", "100% 0%")}
            >
              <line x1="29" y1="53.5" x2="26" y2="61.5" />
              <circle
                cx="25"
                cy="62"
                r="2"
                fill={fillSoft}
                data-testid="motion-foot-left"
              />
            </g>
          </g>

          {/* 右脚 (前脚: 画面右へ伸びる)。 */}
          <g
            data-motion-target="human.rightLeg"
            data-motion-role="thigh"
            data-testid="motion-part-human-rightLeg"
            style={legPivotStyle("human.rightLeg")}
          >
            <line x1="32" y1="43" x2="35" y2="53.5" />
            <circle
              cx="35"
              cy="53.5"
              r="1.6"
              fill={fillSoft}
              stroke={accentSoft}
              strokeWidth={1.2}
            />
            <g
              data-motion-target="human.rightLeg"
              data-motion-joint="rightKnee"
              data-motion-role="shin"
              data-testid="motion-joint-rightKnee"
              style={flexStyle(plan, "human.rightLeg", "knee", "0% 0%")}
            >
              <line x1="35" y1="53.5" x2="38" y2="61.5" />
              <circle
                cx="39"
                cy="62"
                r="2"
                fill={fillSoft}
                data-testid="motion-foot-right"
              />
            </g>
          </g>

          {/* 右腕 (far side / 画面左): 後方→前方に振る */}
          <g
            data-motion-target="human.rightArm"
            data-motion-role="upperArm"
            data-testid="motion-part-human-rightArm"
            style={armPivotStyle("human.rightArm")}
          >
            <line x1="32" y1="27" x2="28.5" y2="35" />
            <circle
              cx="28.5"
              cy="35"
              r="1.4"
              fill={fillSoft}
              stroke={accentSoft}
              strokeWidth={1.2}
            />
            <g
              data-motion-target="human.rightArm"
              data-motion-joint="rightElbow"
              data-motion-role="forearm"
              data-testid="motion-joint-rightElbow"
              style={flexStyle(plan, "human.rightArm", "elbow", "100% 0%")}
            >
              <line x1="28.5" y1="35" x2="25.5" y2="41.5" />
              <circle cx="25" cy="42" r="2" fill={fillSoft} data-testid="motion-hand-right" />
            </g>
          </g>

          {/* 左腕 (near side / 画面右): 前方→後方に振る */}
          <g
            data-motion-target="human.leftArm"
            data-motion-role="upperArm"
            data-testid="motion-part-human-leftArm"
            style={armPivotStyle("human.leftArm")}
          >
            <line x1="32" y1="27" x2="35.5" y2="35" />
            <circle
              cx="35.5"
              cy="35"
              r="1.4"
              fill={fillSoft}
              stroke={accentSoft}
              strokeWidth={1.2}
            />
            <g
              data-motion-target="human.leftArm"
              data-motion-joint="leftElbow"
              data-motion-role="forearm"
              data-testid="motion-joint-leftElbow"
              style={flexStyle(plan, "human.leftArm", "elbow", "0% 0%")}
            >
              <line x1="35.5" y1="35" x2="38.5" y2="41.5" />
              <circle cx="39" cy="42" r="2" fill={fillSoft} data-testid="motion-hand-left" />
            </g>
          </g>

          {/* 頭部 (最前面): 右向きプロファイル */}
          <g
            data-motion-target="human.head"
            data-motion-role="head"
            data-testid="motion-part-human-head"
            style={partMotionStyle(plan, "human.head")}
          >
            <circle cx="32" cy="16" r="7" fill={fillSoft} />
            <path
              d="M38.5 14.8 L42 16.5 L38.5 18.2 Z"
              fill={fillSoft}
              strokeWidth={1.6}
            />
            <circle cx="34.8" cy="14.6" r="0.9" fill={color} stroke="none" />
            <path
              d="M32.3 19.2 Q35 21 37.6 19.6"
              strokeWidth={1.4}
              fill="none"
            />
            <line x1="32" y1="23" x2="32" y2="25.5" />
          </g>
        </g>
      </g>
    </svg>
  );
}

function BubbleMotionRenderer({
  config,
  size,
  plan,
  target,
}: {
  config: EdgeMotionConfig;
  size: number;
  plan: GenerativeMotionPlan;
  target: "speechBubble" | "thoughtBubble";
}) {
  const operation =
    operationForTarget(plan, target) ??
    operationForTarget(plan, "edgeGlyph") ??
    plan.recipe.operations[0];
  const style = operation
    ? partMotionStyle(
        {
          ...plan,
          recipe: {
            ...plan.recipe,
            operations: [{ ...operation, target: "human.head" }],
          },
        },
        "human.head",
      )
    : undefined;
  const isThought = target === "thoughtBubble";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke={config.color}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {isThought ? (
        <>
          <circle cx="34" cy="28" r="15" fill={`${config.color}22`} />
          <circle cx="20" cy="43" r="4" fill={`${config.color}22`} />
          <circle cx="13" cy="51" r="2.5" fill={`${config.color}22`} />
        </>
      ) : (
        <path
          d="M14 18 Q14 11 22 11 H43 Q51 11 51 19 V33 Q51 41 43 41 H29 L18 52 V41 Q14 40 14 33 Z"
          fill={`${config.color}22`}
        />
      )}
    </svg>
  );
}

export function BodyPartsPictogramRenderer({
  config,
  size,
}: PictogramRendererProps) {
  const plan = config.generativeMotionPlan;
  if (!plan) return <IconPictogramRenderer config={config} size={size} />;

  if (plan.asset.kind === "human" || hasHumanTargets(plan)) {
    return (
      <div
        className="body-parts-pictogram"
        style={{ width: size, height: size }}
      >
        <HumanBodyPartsSvg
          config={config}
          size={Math.round(size * 0.8)}
          plan={plan}
        />
      </div>
    );
  }

  if (plan.recipe.preset === "dialogueBubble" || plan.asset.kind === "speech") {
    return (
      <BubbleMotionRenderer
        config={config}
        size={Math.round(size * 0.76)}
        plan={plan}
        target="speechBubble"
      />
    );
  }

  if (plan.recipe.preset === "thoughtBubble" || plan.asset.kind === "thought") {
    return (
      <BubbleMotionRenderer
        config={config}
        size={Math.round(size * 0.76)}
        plan={plan}
        target="thoughtBubble"
      />
    );
  }

  return <IconPictogramRenderer config={config} size={size} />;
}

export function GenerativeMotionPictogramRenderer(
  props: PictogramRendererProps,
) {
  return props.config.generativeMotionPlan ? (
    <BodyPartsPictogramRenderer {...props} />
  ) : (
    <IconPictogramRenderer {...props} />
  );
}

type ScenePoint = { x: number; y: number };

type AnchoredForeignObjectProps = {
  x: number;
  y: number;
  size: number;
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

function AnchoredForeignObject({
  x,
  y,
  size,
  opacity = 1,
  className,
  style,
  children,
}: AnchoredForeignObjectProps) {
  const half = size / 2;
  return (
    <foreignObject
      x={x - half}
      y={y - half}
      width={size}
      height={size}
      overflow="visible"
      opacity={opacity}
    >
      <div
        // @ts-expect-error xmlns is a valid SVG attribute for foreignObject body
        xmlns="http://www.w3.org/1999/xhtml"
        className={className}
        style={{ width: size, height: size, ...style }}
      >
        {children}
      </div>
    </foreignObject>
  );
}

function pointAlongEdge(
  source: ScenePoint,
  target: ScenePoint,
  ratio: number,
  normalOffset = 0,
): ScenePoint {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return {
    x: source.x + dx * ratio + nx * normalOffset,
    y: source.y + dy * ratio + ny * normalOffset,
  };
}

function getSceneVector(source: ScenePoint, target: ScenePoint) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    ux: dx / len,
    uy: dy / len,
  };
}

function actorAnchorForPlan(
  plan: GenerativeMotionPlan | undefined,
): "source" | "target" {
  if (!plan) return "source";
  if (plan.participants.primaryTarget === "target") return "target";
  if (plan.participants.direction === "targetToSource") return "target";
  return "source";
}

function glyphTargetForPlan(plan: GenerativeMotionPlan): MotionTarget {
  if (
    plan.recipe.operations.some(
      (operation) => operation.target === "speechBubble",
    )
  ) {
    return "speechBubble";
  }
  if (
    plan.recipe.operations.some(
      (operation) => operation.target === "thoughtBubble",
    )
  ) {
    return "thoughtBubble";
  }
  if (
    plan.recipe.operations.some(
      (operation) => operation.target === "transferredObject",
    )
  ) {
    return "transferredObject";
  }
  if (
    plan.recipe.operations.some((operation) => operation.target === "edgeGlyph")
  ) {
    return "edgeGlyph";
  }
  if (plan.asset.kind === "speech") return "speechBubble";
  if (plan.asset.kind === "thought") return "thoughtBubble";
  return "edgeGlyph";
}

function edgeOperationForTarget(
  plan: GenerativeMotionPlan,
  target: MotionTarget,
): MotionOperation | undefined {
  return (
    operationForTarget(plan, target) ??
    operationForTarget(plan, "edgeGlyph") ??
    plan.recipe.operations.find((operation) =>
      ["pathMovement", "scale", "appearance", "disappearance"].includes(
        operation.type,
      ),
    )
  );
}

function edgeGlyphStyle(
  plan: GenerativeMotionPlan,
  target: MotionTarget,
  vector: { ux: number; uy: number },
): MotionStyle | undefined {
  const operation = edgeOperationForTarget(plan, target);
  if (!operation) return undefined;

  const common = operationPlaybackStyle(plan, operation);

  switch (operation.type) {
    case "pathMovement": {
      const intensity = Math.max(0.25, plan.playback.intensity);
      const direction =
        operation.path === "towardSource"
          ? -1
          : operation.path === "jitter"
            ? 0.35
            : 1;
      const fromOffset =
        (operation.fromOffset ?? -operation.amplitude) * intensity;
      const toOffset = (operation.toOffset ?? operation.amplitude) * intensity;
      return {
        ...common,
        animationName: "body-part-translate-yoyo",
        "--motion-translate-x-from": `${vector.ux * fromOffset * direction}px`,
        "--motion-translate-y-from": `${vector.uy * fromOffset * direction}px`,
        "--motion-translate-x-to": `${vector.ux * toOffset * direction}px`,
        "--motion-translate-y-to": `${vector.uy * toOffset * direction}px`,
      };
    }
    case "scale":
      return {
        ...common,
        animationName: "body-part-scale-yoyo",
        "--motion-scale-from": operation.from,
        "--motion-scale-to": operation.to,
      };
    case "appearance":
      return {
        ...common,
        animationName:
          operation.mode === "fade"
            ? "body-part-fade-yoyo"
            : "body-part-pop-yoyo",
      };
    case "disappearance":
      return {
        ...common,
        animationName: "body-part-vanish-yoyo",
      };
    default:
      return undefined;
  }
}

function shouldRenderEdgeGlyph(
  plan: GenerativeMotionPlan | undefined,
): boolean {
  if (!plan) return true;
  return plan.recipe.operations.some((operation) =>
    [
      "edgeGlyph",
      "transferredObject",
      "speechBubble",
      "thoughtBubble",
      "sourceNode",
      "targetNode",
    ].includes(operation.target),
  );
}

function nodeHaloStyle(
  plan: GenerativeMotionPlan,
  target: "sourceNode" | "targetNode",
): MotionStyle | undefined {
  const operation = operationForTarget(plan, target);
  if (!operation) return undefined;
  const common: MotionStyle = {
    transformBox: "fill-box",
    transformOrigin: "center",
    ...operationPlaybackStyle(plan, operation),
  };

  if (operation.type === "scale") {
    return {
      ...common,
      animationName: "body-part-scale-yoyo",
      "--motion-scale-from": operation.from,
      "--motion-scale-to": operation.to,
    };
  }
  if (operation.type === "appearance") {
    return {
      ...common,
      animationName:
        operation.mode === "fade"
          ? "body-part-fade-yoyo"
          : "body-part-pop-yoyo",
    };
  }
  if (operation.type === "pathMovement") {
    return {
      ...common,
      animationName: "body-part-pop-yoyo",
    };
  }
  return undefined;
}

function SceneNodeHalo({
  config,
  plan,
  x,
  y,
  target,
  size,
}: {
  config: EdgeMotionConfig;
  plan: GenerativeMotionPlan;
  x: number;
  y: number;
  target: "sourceNode" | "targetNode";
  size: number;
}) {
  const style = nodeHaloStyle(plan, target);
  if (!style) return null;
  return (
    <circle
      cx={x}
      cy={y}
      r={size * 0.28}
      fill={`${config.color}16`}
      stroke={config.color}
      strokeOpacity={0.45}
      strokeWidth={1.5}
      style={style}
    />
  );
}

/**
 * ノードペア全体を一つの意味アニメーション scene として描く。
 * actor は source/target ノード上に固定し、移動物体・吹き出し・衝撃などはエッジ上へ置く。
 */
export function EdgeSemanticMotionScene({
  config,
  sourceX,
  sourceY,
  targetX,
  targetY,
  displayScale,
  opacity = 1,
}: {
  config: EdgeMotionConfig;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  displayScale: number;
  opacity?: number;
}) {
  const plan = config.generativeMotionPlan;
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const vector = getSceneVector(source, target);
  const baseSize = Math.round(28 / Math.max(0.5, displayScale));
  const actorSize = Math.round(84 / Math.max(0.5, displayScale));
  const glyphSize = Math.round(30 / Math.max(0.5, displayScale));
  const glyphTarget = plan ? glyphTargetForPlan(plan) : "edgeGlyph";
  const glyphRatio =
    glyphTarget === "speechBubble" || glyphTarget === "thoughtBubble"
      ? 0.35
      : 0.5;
  const glyphPoint = pointAlongEdge(
    source,
    target,
    glyphRatio,
    glyphTarget === "speechBubble" || glyphTarget === "thoughtBubble"
      ? -baseSize * 0.35
      : 0,
  );
  const actorAnchor = actorAnchorForPlan(plan);
  const actorPoint = actorAnchor === "target" ? target : source;
  const humanPlan =
    plan && (plan.asset.kind === "human" || hasHumanTargets(plan))
      ? plan
      : undefined;
  const actorFacesLeft =
    actorAnchor === "source" ? vector.ux < 0 : vector.ux > 0;
  const actorTransform = actorFacesLeft ? "scaleX(-1)" : undefined;

  return (
    <g
      className="edge-semantic-motion-scene"
      style={{ pointerEvents: "none", opacity }}
    >
      {plan && (
        <>
          <SceneNodeHalo
            config={config}
            plan={plan}
            x={source.x}
            y={source.y}
            target="sourceNode"
            size={actorSize}
          />
          <SceneNodeHalo
            config={config}
            plan={plan}
            x={target.x}
            y={target.y}
            target="targetNode"
            size={actorSize}
          />
        </>
      )}

      {humanPlan && (
        <AnchoredForeignObject
          x={actorPoint.x}
          y={actorPoint.y}
          size={actorSize}
          opacity={opacity}
          className="body-parts-pictogram edge-semantic-actor"
          style={{ transform: actorTransform }}
        >
          <HumanBodyPartsSvg
            config={config}
            size={actorSize}
            plan={humanPlan}
          />
        </AnchoredForeignObject>
      )}

      {(!plan || shouldRenderEdgeGlyph(plan)) && (
        <AnchoredForeignObject
          x={glyphPoint.x}
          y={glyphPoint.y}
          size={glyphSize}
          opacity={opacity}
          className="edge-semantic-glyph"
          style={plan ? edgeGlyphStyle(plan, glyphTarget, vector) : undefined}
        >
          {plan &&
          (glyphTarget === "speechBubble" ||
            glyphTarget === "thoughtBubble") ? (
            <BubbleMotionRenderer
              config={config}
              size={Math.round(glyphSize * 0.82)}
              plan={plan}
              target={glyphTarget}
            />
          ) : (
            <IconPictogramRenderer config={config} size={glyphSize} />
          )}
        </AnchoredForeignObject>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// EdgeSemanticPictogram: エッジ中点に配置するコンテナ（SVG <g> + <foreignObject>）
// ---------------------------------------------------------------------------

export function EdgeSemanticPictogram({
  config,
  cx,
  cy,
  displayScale,
  opacity = 1,
  renderer: Renderer = GenerativeMotionPictogramRenderer,
}: {
  config: EdgeMotionConfig;
  /** SVG座標系でのエッジ中点X */
  cx: number;
  /** SVG座標系でのエッジ中点Y */
  cy: number;
  /** 表示スケール（ズーム係数の逆数でサイズを一定に保つ） */
  displayScale: number;
  opacity?: number;
  /**
   * ピクトグラム描画の実装を差し替えられる。
   * デフォルト: IconPictogramRenderer
   * 将来: BodyPartsPictogramRenderer（案2）や LottiePictogramRenderer
   */
  renderer?: React.ComponentType<PictogramRendererProps>;
}) {
  const BASE_SIZE = 28;
  const size = Math.round(BASE_SIZE / Math.max(0.5, displayScale));
  const half = size / 2;

  return (
    <g
      transform={`translate(${cx}, ${cy})`}
      style={{ pointerEvents: "none", opacity }}
      className="edge-semantic-pictogram"
    >
      <foreignObject
        x={-half}
        y={-half}
        width={size}
        height={size}
        overflow="visible"
      >
        {/* xmlns は <foreignObject> 内の HTML を有効化するために必要 */}
        <div
          // @ts-expect-error xmlns is a valid SVG attribute for foreignObject body
          xmlns="http://www.w3.org/1999/xhtml"
          style={{ width: size, height: size }}
        >
          <Renderer config={config} size={size} />
        </div>
      </foreignObject>
    </g>
  );
}
