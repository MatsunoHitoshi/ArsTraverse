"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CDT_ANIMATION_MAP,
  CDT_CATEGORIES,
  type CdtCategory,
  type EdgeMotionConfig,
} from "@/app/const/edge-cdt-animation";
import {
  buildDefaultGenerativeMotionPlan,
  normalizeGenerativeMotionPlan,
  type GenerativeMotionPlan,
  type MotionOperation,
} from "@/app/const/generative-motion-plan";
import {
  DIRECTION_HINTS,
  validateHumanMotionPlan,
  type DirectionHint,
  type MotionIntent,
  type MotionPlanValidationResult,
} from "@/app/const/motion-intent";
import {
  EdgeSemanticMotionScene,
  GenerativeMotionPictogramRenderer,
} from "@/app/_components/d3/force/storytelling-graph/components/edge-semantic-pictogram";

type JsonRecord = Record<string, unknown>;

type PipelineStoryboard = {
  edgeId: string;
  cdtCategory: string;
  motionIntent: MotionIntent;
  storyboard: string;
  requiredParts: string[];
  assetHint: { kind: string; assetId?: string };
};

type LlmGenerateResponse = {
  pipelineVersion?: 1 | 2;
  stageA?: PipelineStoryboard;
  stageB?: { source: "llm" | "template" | "fallback"; rawMotionPlanProvided?: boolean };
  cdtCategory?: CdtCategory;
  rawText?: string;
  rawMotionPlanProvided?: boolean;
  motionPlan?: GenerativeMotionPlan;
  validation?: MotionPlanValidationResult;
  error?: string;
};

type LabScenarioId =
  | "run-right"
  | "run-left"
  | "fight-impact"
  | "fight-defend"
  | "dance-rhythm"
  | "wave-greet";

const LAB_SCENARIOS: Record<
  LabScenarioId,
  {
    label: string;
    predicate: string;
    sourceName: string;
    sourceLabel: string;
    targetName: string;
    targetLabel: string;
    directionHint: DirectionHint;
    category: CdtCategory;
  }
> = {
  "run-right": {
    label: "走る（右）",
    predicate: "PARTICIPATED_IN",
    sourceName: "作家A",
    sourceLabel: "Person",
    targetName: "イベントB",
    targetLabel: "Event",
    directionHint: "right",
    category: "MOVE",
  },
  "run-left": {
    label: "走る（左）",
    predicate: "VISITED",
    sourceName: "作家A",
    sourceLabel: "Person",
    targetName: "美術館",
    targetLabel: "Place",
    directionHint: "left",
    category: "PTRANS",
  },
  "fight-impact": {
    label: "戦う（攻撃）",
    predicate: "ATTACKED",
    sourceName: "武士A",
    sourceLabel: "Person",
    targetName: "武士B",
    targetLabel: "Person",
    directionHint: "right",
    category: "PROPEL",
  },
  "fight-defend": {
    label: "戦う（防御）",
    predicate: "FOUGHT",
    sourceName: "武士B",
    sourceLabel: "Person",
    targetName: "武士A",
    targetLabel: "Person",
    directionHint: "left",
    category: "PROPEL",
  },
  "dance-rhythm": {
    label: "踊る",
    predicate: "DANCED_WITH",
    sourceName: "舞者A",
    sourceLabel: "Person",
    targetName: "舞者B",
    targetLabel: "Person",
    directionHint: "auto",
    category: "MOVE",
  },
  "wave-greet": {
    label: "手を振る",
    predicate: "WAVED_TO",
    sourceName: "作家A",
    sourceLabel: "Person",
    targetName: "観客",
    targetLabel: "Person",
    directionHint: "right",
    category: "MOVE",
  },
};

type PreviewMode = "scene" | "actor";

type LabPresetId = "run-right" | "wave-right" | "wave-left";
type RunCyclePhaseId = "contact" | "down" | "pass" | "up";

const RUN_CYCLE_PHASES: RunCyclePhaseId[] = ["contact", "down", "pass", "up"];

const RUN_CYCLE_PHASE_SEEK: Record<RunCyclePhaseId, number> = {
  contact: 0,
  down: 0.25,
  pass: 0.5,
  up: 0.75,
};

type DomInspection = {
  tagName: string;
  motionTarget?: string;
  motionJoint?: string;
  motionRole?: string;
  id?: string;
  className?: string;
  attributes: Array<{ name: string; value: string }>;
  hierarchy: string[];
  outerHtml: string;
};

const DEFAULT_CONTEXT = {
  predicate: "PARTICIPATED_IN",
  sourceName: "作家A",
  sourceLabel: "Person",
  targetName: "イベントB",
  targetLabel: "Event",
};

function buildRunningLabPreset({
  predicate,
  sourceName,
  sourceLabel,
  targetName,
  targetLabel,
}: {
  predicate: string;
  sourceName: string;
  sourceLabel: string;
  targetName: string;
  targetLabel: string;
}): GenerativeMotionPlan {
  const base = buildDefaultGenerativeMotionPlan("MOVE", predicate, {
    sourceName,
    sourceLabel,
    targetName,
    targetLabel,
  });

  return {
    ...base,
    semantic: {
      cdtCategory: "MOVE",
      predicate,
      intent: `${sourceName || "actor"} runs to the right toward ${targetName || "target"
        }`,
      confidence: 0.95,
    },
    participants: {
      sourceRole: "actor",
      targetRole: "destination",
      primaryTarget: "source",
      direction: "sourceToTarget",
    },
    asset: {
      kind: "human",
      assetId: "human-runner-right",
      requiredParts: [
        "human.body",
        "human.head",
        "human.leftArm",
        "human.rightArm",
        "human.leftLeg",
        "human.rightLeg",
      ],
    },
    recipe: {
      preset: "bodyPartMotion",
      // 4-phase FULL cycle (2 steps): Contact(0%) → Down(25%) → Pass(50%) → Up(75%) → Contact(100%)
      // contact: 右足着地 (右前・左後) / down: 右足支持+左足振り上げ / pass: 左足着地 / up: 左足支持+右足振り上げ
      // 右プロファイル: +θ = CW、-θ = CCW (前方＝画面右)。contact↔pass で左右対称 → ループ時ワープなし。
      // easing: linear — 滑らかさはレンダラ側で 4-phase → 16 点 cosine 細分化。
      operations: [
        {
          type: "pathMovement",
          target: "human.body",
          path: "jitter",
          amplitude: 2,
          role: "anticipation",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: 0, down: 1.2, pass: 0, up: 1.2 },
        },
        {
          type: "rotation",
          target: "human.body",
          degrees: 16,
          origin: "hip",
          role: "anticipation",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: 16, down: 16, pass: 16, up: 16 },
        },
        {
          type: "rotation",
          target: "human.head",
          degrees: 4,
          origin: "neck",
          role: "reaction",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: -2, down: 0, pass: -2, up: 0 },
        },
        {
          type: "rotation",
          target: "human.rightLeg",
          degrees: 45,
          origin: "hip",
          role: "action",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: -45, down: -15, pass: 55, up: -25 },
        },
        {
          type: "rotation",
          target: "human.rightLeg",
          degrees: 90,
          origin: "custom",
          role: "effect",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: 15, down: 45, pass: 55, up: 90 },
        },
        {
          type: "rotation",
          target: "human.leftLeg",
          degrees: 45,
          origin: "hip",
          role: "action",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: 45, down: -25, pass: -88, up: -15 },
        },
        {
          type: "rotation",
          target: "human.leftLeg",
          degrees: 90,
          origin: "custom",
          role: "effect",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: 25, down: 90, pass: 0, up: 45 },
        },
        // 腕: leftArm を基準に、肩 action は同相で符号反転、肘 effect は半周期シフト（符号はそのまま）
        {
          type: "rotation",
          target: "human.leftArm",
          degrees: 55,
          origin: "shoulder",
          role: "action",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: -50, down: 0, pass: 85, up: 0 },
        },
        {
          type: "rotation",
          target: "human.leftArm",
          degrees: 45,
          origin: "custom",
          role: "effect",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: -35, down: -45, pass: -20, up: -45 },
        },
        {
          type: "rotation",
          target: "human.rightArm",
          degrees: 55,
          origin: "shoulder",
          role: "action",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: 50, down: 0, pass: -85, up: 0 },
        },
        {
          type: "rotation",
          target: "human.rightArm",
          degrees: 45,
          origin: "custom",
          role: "effect",
          timing: { start: 0, duration: 1 },
          repeat: "loop",
          easing: "linear",
          keyframes: { contact: -20, down: -45, pass: -35, up: -45 },
        },
      ],
    },
    playback: {
      durationMs: 600,
      delayMs: 0,
      loop: true,
      yoyo: false,
      easing: "linear",
      intensity: 1,
    },
  };
}

function buildRightHandWaveLabPreset({
  predicate,
  sourceName,
  sourceLabel,
  targetName,
  targetLabel,
}: {
  predicate: string;
  sourceName: string;
  sourceLabel: string;
  targetName: string;
  targetLabel: string;
}): GenerativeMotionPlan {
  const base = buildDefaultGenerativeMotionPlan("MOVE", predicate, {
    sourceName,
    sourceLabel,
    targetName,
    targetLabel,
  });

  return {
    ...base,
    semantic: {
      cdtCategory: "MOVE",
      predicate,
      intent: `${sourceName || "actor"} raises the right hand and waves to ${targetName || "target"
        }`,
      confidence: 0.95,
    },
    participants: {
      sourceRole: "actor",
      targetRole: "listener",
      primaryTarget: "source",
      direction: "sourceToTarget",
    },
    asset: {
      kind: "human",
      assetId: "human-basic",
      requiredParts: [
        "human.body",
        "human.head",
        "human.leftArm",
        "human.rightArm",
      ],
    },
    recipe: {
      preset: "bodyPartMotion",
      operations: [
        {
          type: "rotation",
          target: "human.rightArm",
          degrees: 128,
          fromDegrees: -132,
          toDegrees: -80,
          origin: "shoulder",
          role: "action",
          timing: { start: 0, duration: 1 },
          repeat: "yoyo",
          easing: "easeInOut",
        },
        {
          type: "rotation",
          target: "human.rightArm",
          degrees: 90,
          fromDegrees: -96,
          toDegrees: -20,
          origin: "custom",
          role: "effect",
          timing: { start: 0, duration: 1 },
          repeat: "yoyo",
          easing: "easeInOut",
        },
        {
          type: "rotation",
          target: "human.head",
          degrees: 6,
          fromDegrees: -3,
          toDegrees: 6,
          origin: "neck",
          role: "reaction",
          timing: { start: 0.05, duration: 0.9 },
          repeat: "yoyo",
          easing: "easeInOut",
        },
        {
          type: "rotation",
          target: "human.leftArm",
          degrees: 4,
          fromDegrees: 2,
          toDegrees: -4,
          origin: "shoulder",
          role: "idle",
          timing: { start: 0, duration: 1 },
          repeat: "yoyo",
          easing: "breath",
          phase: 0.35,
        },
        {
          type: "rotation",
          target: "human.leftArm",
          degrees: 12,
          fromDegrees: -12,
          toDegrees: -12,
          origin: "custom",
          role: "effect",
          timing: { start: 0, duration: 1 },
          repeat: "once",
          easing: "breath",
        },
        {
          type: "rotation",
          target: "human.body",
          degrees: 2,
          fromDegrees: -1,
          toDegrees: 2,
          origin: "hip",
          role: "idle",
          timing: { start: 0, duration: 1 },
          repeat: "yoyo",
          easing: "breath",
        },
      ],
    },
    playback: {
      durationMs: 900,
      delayMs: 0,
      loop: true,
      yoyo: true,
      easing: "easeInOut",
      intensity: 0.75,
    },
  };
}

function buildLeftHandWaveLabPreset({
  predicate,
  sourceName,
  sourceLabel,
  targetName,
  targetLabel,
}: {
  predicate: string;
  sourceName: string;
  sourceLabel: string;
  targetName: string;
  targetLabel: string;
}): GenerativeMotionPlan {
  const base = buildDefaultGenerativeMotionPlan("MOVE", predicate, {
    sourceName,
    sourceLabel,
    targetName,
    targetLabel,
  });

  return {
    ...base,
    semantic: {
      cdtCategory: "MOVE",
      predicate,
      intent: `${sourceName || "actor"} raises the left hand and waves to ${targetName || "target"
        }`,
      confidence: 0.95,
    },
    participants: {
      sourceRole: "actor",
      targetRole: "listener",
      primaryTarget: "source",
      direction: "sourceToTarget",
    },
    asset: {
      kind: "human",
      assetId: "human-basic",
      requiredParts: [
        "human.body",
        "human.head",
        "human.leftArm",
        "human.rightArm",
      ],
    },
    recipe: {
      preset: "bodyPartMotion",
      operations: [
        {
          type: "rotation",
          target: "human.leftArm",
          degrees: 128,
          fromDegrees: 132,
          toDegrees: 80,
          origin: "shoulder",
          role: "action",
          timing: { start: 0, duration: 1 },
          repeat: "yoyo",
          easing: "easeInOut",
        },
        {
          type: "rotation",
          target: "human.leftArm",
          degrees: 90,
          fromDegrees: 96,
          toDegrees: 20,
          origin: "custom",
          role: "effect",
          timing: { start: 0, duration: 1 },
          repeat: "yoyo",
          easing: "easeInOut",
        },
        {
          type: "rotation",
          target: "human.head",
          degrees: 6,
          fromDegrees: 3,
          toDegrees: -6,
          origin: "neck",
          role: "reaction",
          timing: { start: 0.05, duration: 0.9 },
          repeat: "yoyo",
          easing: "easeInOut",
        },
        {
          type: "rotation",
          target: "human.rightArm",
          degrees: 4,
          fromDegrees: -2,
          toDegrees: 4,
          origin: "shoulder",
          role: "idle",
          timing: { start: 0, duration: 1 },
          repeat: "yoyo",
          easing: "breath",
          phase: 0.35,
        },
        {
          type: "rotation",
          target: "human.rightArm",
          degrees: 12,
          fromDegrees: 12,
          toDegrees: 12,
          origin: "custom",
          role: "effect",
          timing: { start: 0, duration: 1 },
          repeat: "once",
          easing: "breath",
        },
        {
          type: "rotation",
          target: "human.body",
          degrees: 2,
          fromDegrees: 1,
          toDegrees: -2,
          origin: "hip",
          role: "idle",
          timing: { start: 0, duration: 1 },
          repeat: "yoyo",
          easing: "breath",
        },
      ],
    },
    playback: {
      durationMs: 900,
      delayMs: 0,
      loop: true,
      yoyo: true,
      easing: "easeInOut",
      intensity: 0.75,
    },
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJsonRecord(text: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cloneRecord(value: unknown): JsonRecord {
  const cloned = JSON.parse(JSON.stringify(value)) as unknown;
  return isRecord(cloned) ? cloned : {};
}

function getRecipeRecord(plan: JsonRecord): JsonRecord {
  if (!isRecord(plan.recipe)) {
    plan.recipe = {};
  }
  return isRecord(plan.recipe) ? plan.recipe : {};
}

function getOperationsArray(plan: JsonRecord): JsonRecord[] {
  const recipe = getRecipeRecord(plan);
  if (!Array.isArray(recipe.operations)) {
    recipe.operations = [];
  }
  const operations = recipe.operations;
  return Array.isArray(operations) ? operations.filter(isRecord) : [];
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function operationLabel(operation: MotionOperation, index: number): string {
  return `${index + 1}. ${operation.type} / ${operation.target} / ${operation.role ?? "action"
    }`;
}

function operationSummary(operation: MotionOperation): string {
  if (operation.type === "rotation") {
    return `${operation.fromDegrees}deg -> ${operation.toDegrees}deg (${operation.origin ?? "center"})`;
  }
  if (operation.type === "pathMovement") {
    return `${operation.path}: ${operation.fromOffset}px -> ${operation.toOffset}px`;
  }
  if (operation.type === "scale") {
    return `${operation.from} -> ${operation.to}`;
  }
  if (operation.type === "appearance" || operation.type === "disappearance") {
    return operation.mode;
  }
  return operation.type;
}

function elementName(element: Element): string {
  const target = element.getAttribute("data-motion-target");
  const joint = element.getAttribute("data-motion-joint");
  const role = element.getAttribute("data-motion-role");
  const suffix = [target, joint, role].filter(Boolean).join(" / ");
  return suffix
    ? `${element.tagName.toLowerCase()} [${suffix}]`
    : element.tagName.toLowerCase();
}

function inspectSvgElement(target: EventTarget | null): DomInspection | null {
  if (!(target instanceof Element)) return null;
  const svg = target.closest("svg");
  if (!svg) return null;

  const inspected =
    target.closest("[data-motion-target], [data-motion-joint]") ??
    target.closest("path,circle,ellipse,line,g,svg") ??
    target;
  const attributes = Array.from(inspected.attributes).map((attribute) => ({
    name: attribute.name,
    value: attribute.value,
  }));
  const hierarchy: string[] = [];
  let cursor: Element | null = inspected;
  while (cursor && cursor !== svg.parentElement) {
    hierarchy.unshift(elementName(cursor));
    if (cursor === svg) break;
    cursor = cursor.parentElement;
  }

  return {
    tagName: inspected.tagName.toLowerCase(),
    motionTarget: inspected.getAttribute("data-motion-target") ?? undefined,
    motionJoint: inspected.getAttribute("data-motion-joint") ?? undefined,
    motionRole: inspected.getAttribute("data-motion-role") ?? undefined,
    id: inspected.id || undefined,
    className: inspected.getAttribute("class") ?? undefined,
    attributes,
    hierarchy,
    outerHtml:
      inspected.outerHTML.length > 1000
        ? `${inspected.outerHTML.slice(0, 1000)}...`
        : inspected.outerHTML,
  };
}

export function MotionPlanLabClient() {
  const [category, setCategory] = useState<CdtCategory>("MOVE");
  const [predicate, setPredicate] = useState(DEFAULT_CONTEXT.predicate);
  const [sourceName, setSourceName] = useState(DEFAULT_CONTEXT.sourceName);
  const [sourceLabel, setSourceLabel] = useState(DEFAULT_CONTEXT.sourceLabel);
  const [targetName, setTargetName] = useState(DEFAULT_CONTEXT.targetName);
  const [targetLabel, setTargetLabel] = useState(DEFAULT_CONTEXT.targetLabel);
  const [selectedOperationIndex, setSelectedOperationIndex] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("scene");
  const [isPreviewPaused, setIsPreviewPaused] = useState(false);
  const [isLimbColorCodingEnabled, setIsLimbColorCodingEnabled] =
    useState(true);
  const [previewPhaseSeek, setPreviewPhaseSeek] = useState<number | null>(null);
  const [runRightPhase, setRunRightPhase] = useState<RunCyclePhaseId | null>(
    null,
  );
  const [inspectedElement, setInspectedElement] =
    useState<DomInspection | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rawLlmText, setRawLlmText] = useState("");
  const [pipelineVersion, setPipelineVersion] = useState<1 | 2 | null>(null);
  const [stageAStoryboard, setStageAStoryboard] =
    useState<PipelineStoryboard | null>(null);
  const [stageBSource, setStageBSource] = useState<
    "llm" | "template" | "fallback" | null
  >(null);
  const [directionHint, setDirectionHint] = useState<DirectionHint>("auto");
  const [validationResult, setValidationResult] =
    useState<MotionPlanValidationResult | null>(null);
  const [planText, setPlanText] = useState(() =>
    formatJson(
      buildDefaultGenerativeMotionPlan("MOVE", DEFAULT_CONTEXT.predicate, {
        sourceName: DEFAULT_CONTEXT.sourceName,
        sourceLabel: DEFAULT_CONTEXT.sourceLabel,
        targetName: DEFAULT_CONTEXT.targetName,
        targetLabel: DEFAULT_CONTEXT.targetLabel,
      }),
    ),
  );

  const parsedPlan = useMemo(() => parseJsonRecord(planText), [planText]);
  const parseError = parsedPlan ? null : "JSONとして解釈できません";
  const planContext = useMemo(
    () => ({
      sourceName,
      sourceLabel,
      targetName,
      targetLabel,
      directionHint,
    }),
    [directionHint, sourceLabel, sourceName, targetLabel, targetName],
  );

  const normalizedPlan = useMemo(
    () => normalizeGenerativeMotionPlan(parsedPlan, category, predicate, planContext),
    [category, parsedPlan, planContext, predicate],
  );

  const localValidation = useMemo(
    () => validateHumanMotionPlan(normalizedPlan, planContext),
    [normalizedPlan, planContext],
  );
  const config = useMemo<EdgeMotionConfig>(
    () => ({
      ...CDT_ANIMATION_MAP[category],
      category,
      generativeMotionPlan: normalizedPlan,
    }),
    [category, normalizedPlan],
  );

  const selectedOperation =
    normalizedPlan.recipe.operations[selectedOperationIndex] ??
    normalizedPlan.recipe.operations[0] ??
    null;

  useEffect(() => {
    if (previewPhaseSeek == null || !isPreviewPaused || previewMode !== "actor") {
      return;
    }
    const durationMs = Math.max(120, normalizedPlan.playback.durationMs);
    const negDelayMs = -previewPhaseSeek * durationMs;

    const applySeek = () => {
      const root = document.querySelector('[data-testid="motion-preview-actor"]');
      if (!root) return;
      root.removeAttribute("data-motion-phase-seek-ready");
      root.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const name = getComputedStyle(el).animationName;
        if (name && name !== "none") {
          el.style.animationDelay = `${negDelayMs}ms`;
          el.style.animationPlayState = "paused";
        }
      });
      root.setAttribute("data-motion-phase-seek-ready", "1");
    };

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(applySeek);
    });
    return () => cancelAnimationFrame(id);
  }, [
    previewPhaseSeek,
    isPreviewPaused,
    previewMode,
    normalizedPlan.playback.durationMs,
    planText,
  ]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const preset = searchParams.get("preset") as LabPresetId | null;
    const paused = searchParams.get("paused");
    const phaseParam = searchParams.get("phase") as RunCyclePhaseId | null;

    if (paused === "1" || paused === "true") {
      setIsPreviewPaused(true);
    }

    if (phaseParam && phaseParam in RUN_CYCLE_PHASE_SEEK) {
      setPreviewPhaseSeek(RUN_CYCLE_PHASE_SEEK[phaseParam]);
      setRunRightPhase(phaseParam);
      setIsPreviewPaused(true);
      setPreviewMode("actor");
    }

    if (preset === "run-right") {
      applyRunningPreset();
      return;
    }
    if (preset === "wave-right") {
      applyRightHandWavePreset();
      return;
    }
    if (preset === "wave-left") {
      applyLeftHandWavePreset();
    }
    // Query params are intended as initial lab bootstrapping only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function replacePlan(nextPlan: unknown) {
    setPlanText(formatJson(nextPlan));
  }

  function resetToDefault(nextCategory = category) {
    const plan = buildDefaultGenerativeMotionPlan(nextCategory, predicate, {
      sourceName,
      sourceLabel,
      targetName,
      targetLabel,
    });
    setCategory(nextCategory);
    setSelectedOperationIndex(0);
    replacePlan(plan);
  }

  function applyRunningPreset() {
    const nextPredicate = "RAN_TO";
    const nextSourceLabel = "Person";
    const nextTargetLabel = targetLabel || "Place";
    setCategory("MOVE");
    setPredicate(nextPredicate);
    setSourceLabel(nextSourceLabel);
    setTargetLabel(nextTargetLabel);
    setPreviewMode("actor");
    setSelectedOperationIndex(0);
    replacePlan(
      buildRunningLabPreset({
        predicate: nextPredicate,
        sourceName: sourceName || "Runner",
        sourceLabel: nextSourceLabel,
        targetName: targetName || "Destination",
        targetLabel: nextTargetLabel,
      }),
    );
    setMessage("管理画面確認用の「走る」プリセットを読み込みました。");
  }

  function setRunRightStaticPhase(phase: RunCyclePhaseId) {
    setRunRightPhase(phase);
    setPreviewPhaseSeek(RUN_CYCLE_PHASE_SEEK[phase]);
    setIsPreviewPaused(true);
    setPreviewMode("actor");
  }

  function applyRightHandWavePreset() {
    const nextPredicate = "WAVED_TO";
    const nextSourceLabel = "Person";
    const nextTargetLabel = targetLabel || "Person";
    setCategory("MOVE");
    setPredicate(nextPredicate);
    setSourceLabel(nextSourceLabel);
    setTargetLabel(nextTargetLabel);
    setPreviewMode("actor");
    setSelectedOperationIndex(0);
    replacePlan(
      buildRightHandWaveLabPreset({
        predicate: nextPredicate,
        sourceName: sourceName || "Greeter",
        sourceLabel: nextSourceLabel,
        targetName: targetName || "Viewer",
        targetLabel: nextTargetLabel,
      }),
    );
    setMessage(
      "管理画面確認用の「右手を挙げて手を振る」プリセットを読み込みました。",
    );
  }

  function applyLeftHandWavePreset() {
    const nextPredicate = "WAVED_TO";
    const nextSourceLabel = "Person";
    const nextTargetLabel = targetLabel || "Person";
    setCategory("MOVE");
    setPredicate(nextPredicate);
    setSourceLabel(nextSourceLabel);
    setTargetLabel(nextTargetLabel);
    setPreviewMode("actor");
    setSelectedOperationIndex(0);
    replacePlan(
      buildLeftHandWaveLabPreset({
        predicate: nextPredicate,
        sourceName: sourceName || "Greeter",
        sourceLabel: nextSourceLabel,
        targetName: targetName || "Viewer",
        targetLabel: nextTargetLabel,
      }),
    );
    setMessage(
      "管理画面確認用の「左手を挙げて手を振る」プリセットを読み込みました。",
    );
  }

  function normalizeDraft() {
    replacePlan(normalizedPlan);
    setMessage("正規化済みJSONに整形しました。");
  }

  function updateSelectedOperation(patch: JsonRecord) {
    const base = cloneRecord(parsedPlan ?? normalizedPlan);
    const operations = getOperationsArray(base);
    const index = Math.min(
      Math.max(selectedOperationIndex, 0),
      Math.max(operations.length - 1, 0),
    );
    const current = operations[index] ?? {};
    operations[index] = { ...current, ...patch };
    getRecipeRecord(base).operations = operations;
    setPlanText(formatJson(base));
  }

  function updateSelectedTiming(key: "start" | "duration", value: string) {
    const numeric = numberOrUndefined(value);
    if (numeric == null) return;
    const timing = isRecord(selectedOperation?.timing)
      ? selectedOperation.timing
      : {};
    updateSelectedOperation({
      timing: {
        ...timing,
        [key]: numeric,
      },
    });
  }

  function addOperation(template: JsonRecord) {
    const base = cloneRecord(parsedPlan ?? normalizedPlan);
    const operations = getOperationsArray(base);
    operations.push(template);
    getRecipeRecord(base).operations = operations;
    setSelectedOperationIndex(operations.length - 1);
    setPlanText(formatJson(base));
  }

  function applyLabScenario(scenarioId: LabScenarioId) {
    const scenario = LAB_SCENARIOS[scenarioId];
    setPredicate(scenario.predicate);
    setSourceName(scenario.sourceName);
    setSourceLabel(scenario.sourceLabel);
    setTargetName(scenario.targetName);
    setTargetLabel(scenario.targetLabel);
    setDirectionHint(scenario.directionHint);
    setCategory(scenario.category);
    setPreviewMode("actor");
    setSelectedOperationIndex(0);
    setValidationResult(null);
    setMessage(`シナリオ「${scenario.label}」を読み込みました。LLM生成で試せます。`);
  }

  async function requestLlmSample() {
    setIsGenerating(true);
    setMessage(null);
    setValidationResult(null);
    setStageAStoryboard(null);
    setStageBSource(null);
    setPipelineVersion(null);
    try {
      const response = await fetch("/api/dev/motion-plan-lab/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          edgeType: predicate,
          sourceName,
          sourceLabel,
          targetName,
          targetLabel,
          directionHint,
        }),
      });
      const json = (await response.json()) as LlmGenerateResponse;
      if (!response.ok || json.error) {
        throw new Error(json.error ?? "LLM生成に失敗しました。");
      }
      if (json.cdtCategory) setCategory(json.cdtCategory);
      if (json.motionPlan) replacePlan(json.motionPlan);
      setRawLlmText(json.rawText ?? "");
      setValidationResult(json.validation ?? null);
      setPipelineVersion(json.pipelineVersion ?? 1);
      setStageAStoryboard(json.stageA ?? null);
      setStageBSource(json.stageB?.source ?? null);
      setSelectedOperationIndex(0);
      const validationNote =
        json.validation && !json.validation.ok
          ? ` 検証警告: ${json.validation.errors.length} errors, ${json.validation.warnings.length} warnings.`
          : json.validation?.warnings.length
            ? ` 検証: ${json.validation.warnings.length} warnings.`
            : "";
      const pipelineNote =
        json.pipelineVersion === 2
          ? ` Pipeline v2 / Stage B: ${json.stageB?.source ?? "unknown"}.`
          : "";
      const motionProvided =
        json.pipelineVersion === 2
          ? json.stageB?.rawMotionPlanProvided
          : json.rawMotionPlanProvided;
      setMessage(
        (motionProvided
          ? "LLM生成結果を読み込みました。"
          : "LLM分類は成功しましたが motionPlan はfallbackで補完されました。") +
        pipelineNote +
        validationNote,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-5 py-6">
        <header className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300">
            Development Only
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                GenerativeMotionPlan Lab
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                パラメータを編集しながら、ノードペア上で実際にレンダリングされる動きを確認します。
              </p>
            </div>
            <div className="rounded-lg border border-orange-400/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-100">
              NODE_ENV: development / rendererVersion:{" "}
              {normalizedPlan.rendererVersion}
            </div>
          </div>
        </header>

        {message && (
          <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            {message}
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(520px,1fr)_460px]">
          <aside className="flex flex-col gap-4">
            <Panel title="Node Pair / Edge">
              <Input label="sourceName" value={sourceName} onChange={setSourceName} />
              <Input label="sourceLabel" value={sourceLabel} onChange={setSourceLabel} />
              <Input label="predicate / edgeType" value={predicate} onChange={setPredicate} />
              <Input label="targetName" value={targetName} onChange={setTargetName} />
              <Input label="targetLabel" value={targetLabel} onChange={setTargetLabel} />

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-300">directionHint</span>
                <select
                  value={directionHint}
                  onChange={(event) =>
                    setDirectionHint(event.target.value as DirectionHint)
                  }
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                  data-testid="motion-lab-direction-hint"
                >
                  {DIRECTION_HINTS.map((hint) => (
                    <option key={hint} value={hint}>
                      {hint}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-300">CDT category</span>
                <select
                  value={category}
                  onChange={(event) => resetToDefault(event.target.value as CdtCategory)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
                >
                  {CDT_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => resetToDefault()}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
                >
                  default
                </button>
                <button
                  type="button"
                  onClick={normalizeDraft}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600"
                >
                  normalize
                </button>
              </div>

              <div className="mt-3 rounded-xl border border-orange-400/30 bg-orange-500/10 p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-200">
                  Lab Presets
                </div>
                <button
                  type="button"
                  onClick={applyRunningPreset}
                  className="w-full rounded-lg border border-orange-300/60 bg-orange-500/20 px-3 py-2 text-sm font-bold text-orange-100 hover:bg-orange-500/30"
                >
                  走る（high-intensity gait）
                </button>
                <button
                  type="button"
                  onClick={applyRightHandWavePreset}
                  className="mt-2 w-full rounded-lg border border-orange-300/60 bg-orange-500/20 px-3 py-2 text-sm font-bold text-orange-100 hover:bg-orange-500/30"
                >
                  右手を挙げて手を振る
                </button>
                <button
                  type="button"
                  onClick={applyLeftHandWavePreset}
                  className="mt-2 w-full rounded-lg border border-orange-300/60 bg-orange-500/20 px-3 py-2 text-sm font-bold text-orange-100 hover:bg-orange-500/30"
                >
                  左手を挙げて手を振る
                </button>
                <p className="mt-2 text-xs leading-relaxed text-orange-100/80">
                  大きい脚振り・強い腕振り・体幹前傾・全身bobを組み合わせた確認用プリセットです。
                </p>
              </div>

              <div className="mt-3 rounded-xl border border-sky-400/30 bg-sky-500/10 p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-200">
                  LLM Test Scenarios
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(LAB_SCENARIOS) as LabScenarioId[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => applyLabScenario(id)}
                      className="rounded-lg border border-sky-300/50 bg-sky-500/15 px-2 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25"
                      data-testid={`motion-lab-scenario-${id}`}
                    >
                      {LAB_SCENARIOS[id].label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={requestLlmSample}
                disabled={isGenerating}
                className="mt-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? "LLM生成中..." : "この入力でLLM生成"}
              </button>
            </Panel>

            <Panel title="Operations">
              <div className="flex flex-col gap-2">
                {normalizedPlan.recipe.operations.map((operation, index) => (
                  <button
                    key={`${operation.type}-${operation.target}-${index}`}
                    type="button"
                    onClick={() => setSelectedOperationIndex(index)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs ${selectedOperationIndex === index
                      ? "border-orange-400 bg-orange-500/15"
                      : "border-slate-700 bg-slate-950 hover:bg-slate-800"
                      }`}
                  >
                    <div className="font-semibold">{operationLabel(operation, index)}</div>
                    <div className="mt-1 text-slate-400">
                      {operationSummary(operation)}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    addOperation({
                      type: "rotation",
                      target: "human.head",
                      fromDegrees: -4,
                      toDegrees: 6,
                      origin: "neck",
                      role: "action",
                      repeat: "yoyo",
                      timing: { start: 0, duration: 1 },
                    })
                  }
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800"
                >
                  + head nod
                </button>
                <button
                  type="button"
                  onClick={() =>
                    addOperation({
                      type: "pathMovement",
                      target: "human.body",
                      path: "jitter",
                      fromOffset: -4,
                      toOffset: 4,
                      role: "action",
                      repeat: "yoyo",
                      timing: { start: 0, duration: 1 },
                    })
                  }
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800"
                >
                  + body bob
                </button>
              </div>
            </Panel>
          </aside>

          <section className="flex flex-col gap-4">
            <Panel title="Preview">
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="flex flex-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
                  <PreviewTab
                    active={previewMode === "scene"}
                    onClick={() => setPreviewMode("scene")}
                  >
                    ノードペア
                  </PreviewTab>
                  <PreviewTab
                    active={previewMode === "actor"}
                    onClick={() => setPreviewMode("actor")}
                  >
                    人体アップ
                  </PreviewTab>
                </div>
                <button
                  type="button"
                  aria-pressed={isPreviewPaused}
                  onClick={() => setIsPreviewPaused((paused) => !paused)}
                  className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${isPreviewPaused
                    ? "border-orange-300 bg-orange-500 text-slate-950"
                    : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                    }`}
                >
                  {isPreviewPaused ? "再開" : "一時停止"}
                </button>
                <button
                  type="button"
                  aria-pressed={isLimbColorCodingEnabled}
                  onClick={() =>
                    setIsLimbColorCodingEnabled((enabled) => !enabled)
                  }
                  className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${isLimbColorCodingEnabled
                    ? "border-sky-300 bg-sky-400 text-slate-950"
                    : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                    }`}
                >
                  色分け {isLimbColorCodingEnabled ? "ON" : "OFF"}
                </button>
              </div>

              {previewMode === "actor" &&
                normalizedPlan.asset.assetId === "human-runner-right" && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
                      Phase
                    </span>
                    {RUN_CYCLE_PHASES.map((phase) => {
                      const isActive = runRightPhase === phase;
                      return (
                        <button
                          key={phase}
                          type="button"
                          onClick={() => setRunRightStaticPhase(phase)}
                          className={`rounded-lg px-3 py-2 text-xs font-bold transition ${isActive
                              ? "border-orange-300 bg-orange-500 text-slate-950"
                              : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                            }`}
                        >
                          {phase}
                        </button>
                      );
                    })}
                  </div>
                )}

              {previewMode === "scene" ? (
                <ScenePreview
                  config={config}
                  sourceName={sourceName}
                  targetName={targetName}
                  paused={isPreviewPaused}
                  limbColorCoding={isLimbColorCodingEnabled}
                />
              ) : (
                <ActorCloseUpPreview
                  config={config}
                  plan={normalizedPlan}
                  paused={isPreviewPaused}
                  limbColorCoding={isLimbColorCodingEnabled}
                  onInspect={setInspectedElement}
                />
              )}
            </Panel>

            <Panel title="Selected Operation Controls">
              {selectedOperation ? (
                <OperationEditor
                  operation={selectedOperation}
                  onPatch={updateSelectedOperation}
                  onTiming={updateSelectedTiming}
                />
              ) : (
                <p className="text-sm text-slate-400">operation がありません。</p>
              )}
            </Panel>
          </section>

          <aside className="flex flex-col gap-4">
            <CollapsiblePanel
              title="Clicked SVG Element"
              isOpen={isInspectorOpen}
              onToggle={() => setIsInspectorOpen((open) => !open)}
            >
              {inspectedElement ? (
                <DomInspectionPanel inspection={inspectedElement} />
              ) : (
                <p className="text-sm text-slate-400">
                  「人体アップ」タブでSVGパーツをクリックすると、最寄りの
                  `data-motion-target` とDOM属性を表示します。
                </p>
              )}
            </CollapsiblePanel>

            <Panel title="Raw GenerativeMotionPlan JSON">
              {parseError && (
                <div className="mb-2 rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {parseError}
                </div>
              )}
              <textarea
                value={planText}
                onChange={(event) => setPlanText(event.target.value)}
                spellCheck={false}
                className="h-[440px] w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none focus:border-orange-400"
              />
            </Panel>

            <Panel title="Normalized Output">
              <pre className="max-h-[300px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200">
                {formatJson(normalizedPlan)}
              </pre>
            </Panel>

            <Panel title="Validation">
              <ValidationPanel
                result={validationResult ?? localValidation}
                motionIntent={normalizedPlan.motionIntent}
              />
            </Panel>

            {(stageAStoryboard ?? pipelineVersion === 2) && (
              <Panel title="Pipeline / Storyboard">
                <div
                  className="space-y-2 text-xs"
                  data-testid="motion-lab-storyboard"
                >
                  {pipelineVersion != null && (
                    <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-300">
                      Pipeline v{pipelineVersion}
                      {stageBSource
                        ? ` — Stage B: ${stageBSource}`
                        : ""}
                    </div>
                  )}
                  {stageAStoryboard && (
                    <>
                      <p className="rounded-lg border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-orange-50">
                        {stageAStoryboard.storyboard}
                      </p>
                      <pre className="overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-300">
                        {JSON.stringify(
                          {
                            cdtCategory: stageAStoryboard.cdtCategory,
                            motionIntent: stageAStoryboard.motionIntent,
                            requiredParts: stageAStoryboard.requiredParts,
                            assetHint: stageAStoryboard.assetHint,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </>
                  )}
                </div>
              </Panel>
            )}

            {rawLlmText && (
              <Panel title="Raw LLM Response">
                <pre className="max-h-[220px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                  {rawLlmText}
                </pre>
              </Panel>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl shadow-black/20">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CollapsiblePanel({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl shadow-black/20">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="mb-0 flex w-full items-center justify-between gap-3 text-left"
      >
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
          {title}
        </h2>
        <span className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-semibold text-slate-300">
          {isOpen ? "閉じる" : "開く"}
        </span>
      </button>
      {isOpen && <div className="mt-3">{children}</div>}
    </section>
  );
}

function PreviewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${active
        ? "bg-orange-500 text-slate-950"
        : "text-slate-300 hover:bg-slate-800"
        }`}
    >
      {children}
    </button>
  );
}

function ScenePreview({
  config,
  sourceName,
  targetName,
  paused,
  limbColorCoding,
}: {
  config: EdgeMotionConfig;
  sourceName: string;
  targetName: string;
  paused: boolean;
  limbColorCoding: boolean;
}) {
  return (
    <div
      data-testid="motion-preview-scene"
      className={`motion-plan-lab-preview overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] ${paused ? "motion-plan-lab-preview-paused" : ""
        } ${limbColorCoding ? "motion-plan-lab-limb-colors" : ""
        }`}
    >
      <svg viewBox="0 0 740 420" className="h-[420px] w-full">
        <defs>
          <pattern
            id="motion-lab-grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="#334155"
              strokeOpacity="0.24"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="740" height="420" fill="url(#motion-lab-grid)" />
        <line
          x1="175"
          y1="215"
          x2="565"
          y2="215"
          stroke="#94a3b8"
          strokeWidth="4"
          strokeOpacity="0.42"
        />
        <circle cx="175" cy="215" r="38" fill="#1e293b" stroke="#cbd5e1" />
        <circle cx="565" cy="215" r="38" fill="#1e293b" stroke="#cbd5e1" />
        <text x="175" y="145" textAnchor="middle" fill="#e2e8f0" fontSize="18">
          {sourceName || "source"}
        </text>
        <text x="565" y="145" textAnchor="middle" fill="#e2e8f0" fontSize="18">
          {targetName || "target"}
        </text>
        <EdgeSemanticMotionScene
          config={config}
          sourceX={175}
          sourceY={215}
          targetX={565}
          targetY={215}
          displayScale={1}
        />
      </svg>
    </div>
  );
}

function ActorCloseUpPreview({
  config,
  plan,
  paused,
  limbColorCoding,
  onInspect,
}: {
  config: EdgeMotionConfig;
  plan: GenerativeMotionPlan;
  paused: boolean;
  limbColorCoding: boolean;
  onInspect: (inspection: DomInspection) => void;
}) {
  const isHuman =
    plan.asset.kind === "human" ||
    plan.recipe.operations.some((operation) =>
      operation.target.startsWith("human."),
    );

  return (
    <div
      data-testid="motion-preview-actor"
      className={`motion-plan-lab-preview relative flex h-[520px] items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] ${paused ? "motion-plan-lab-preview-paused" : ""
        } ${limbColorCoding ? "motion-plan-lab-limb-colors" : ""
        }`}
      onClickCapture={(event) => {
        const inspection = inspectSvgElement(event.target);
        if (inspection) onInspect(inspection);
      }}
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.16) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute left-4 top-4 rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
        {isHuman
          ? "人体パーツをクリックするとDOM情報を確認できます"
          : "human asset ではないため glyph 表示になります"}
      </div>
      <div
        data-testid="motion-preview-actor-frame"
        className="relative flex h-[360px] w-[360px] items-center justify-center rounded-full border border-orange-300/20 bg-orange-500/5 shadow-[0_0_80px_rgba(249,115,22,0.18)]"
      >
        <GenerativeMotionPictogramRenderer config={config} size={340} />
      </div>
    </div>
  );
}

function DomInspectionPanel({
  inspection,
}: {
  inspection: DomInspection;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid gap-2 md:grid-cols-3">
        <InfoChip label="tag" value={inspection.tagName} />
        <InfoChip label="motion target" value={inspection.motionTarget ?? "-"} />
        <InfoChip label="joint" value={inspection.motionJoint ?? "-"} />
        <InfoChip label="role" value={inspection.motionRole ?? "-"} />
        <InfoChip label="id" value={inspection.id ?? "-"} />
        <InfoChip label="class" value={inspection.className ?? "-"} />
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Hierarchy
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-slate-300">
          {inspection.hierarchy.join(" > ")}
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Attributes
        </div>
        <pre className="max-h-36 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
          {formatJson(inspection.attributes)}
        </pre>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          outerHTML
        </div>
        <pre className="max-h-40 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
          {inspection.outerHtml}
        </pre>
      </div>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 break-all font-mono text-xs text-slate-200">
        {value}
      </div>
    </div>
  );
}

function ValidationPanel({
  result,
  motionIntent,
}: {
  result: MotionPlanValidationResult;
  motionIntent?: MotionIntent;
}) {
  return (
    <div className="space-y-2 text-xs" data-testid="motion-lab-validation">
      <div
        className={`rounded-lg px-3 py-2 font-semibold ${result.ok
            ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
            : "border border-red-400/40 bg-red-500/10 text-red-100"
          }`}
      >
        {result.ok ? "OK" : "Issues detected"} — errors: {result.errors.length},
        warnings: {result.warnings.length}
      </div>
      {motionIntent && (
        <pre className="overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-300">
          {JSON.stringify(motionIntent, null, 2)}
        </pre>
      )}
      {result.errors.map((issue) => (
        <div
          key={`err-${issue.code}`}
          className="rounded-lg border border-red-400/30 bg-red-500/10 px-2 py-1 text-red-100"
        >
          [{issue.code}] {issue.message}
        </div>
      ))}
      {result.warnings.map((issue) => (
        <div
          key={`warn-${issue.code}`}
          className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-amber-100"
        >
          [{issue.code}] {issue.message}
        </div>
      ))}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-300">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-orange-400"
      />
    </label>
  );
}

function OperationEditor({
  operation,
  onPatch,
  onTiming,
}: {
  operation: MotionOperation;
  onPatch: (patch: JsonRecord) => void;
  onTiming: (key: "start" | "duration", value: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Input
        label="target"
        value={operation.target}
        onChange={(value) => onPatch({ target: value })}
      />
      <Input
        label="role"
        value={operation.role ?? ""}
        onChange={(value) => onPatch({ role: value })}
      />
      <Input
        label="repeat"
        value={operation.repeat ?? ""}
        onChange={(value) => onPatch({ repeat: value })}
      />
      <Input
        label="timing.start"
        value={String(operation.timing?.start ?? 0)}
        onChange={(value) => onTiming("start", value)}
      />
      <Input
        label="timing.duration"
        value={String(operation.timing?.duration ?? 1)}
        onChange={(value) => onTiming("duration", value)}
      />
      <Input
        label="easing"
        value={operation.easing ?? ""}
        onChange={(value) => onPatch({ easing: value })}
      />

      {operation.type === "rotation" && (
        <>
          <Input
            label="fromDegrees"
            value={String(operation.fromDegrees)}
            onChange={(value) =>
              onPatch({ fromDegrees: numberOrUndefined(value) })
            }
          />
          <Input
            label="toDegrees"
            value={String(operation.toDegrees)}
            onChange={(value) => onPatch({ toDegrees: numberOrUndefined(value) })}
          />
          <Input
            label="origin"
            value={operation.origin ?? "center"}
            onChange={(value) => onPatch({ origin: value })}
          />
        </>
      )}

      {operation.type === "pathMovement" && (
        <>
          <Input
            label="path"
            value={operation.path}
            onChange={(value) => onPatch({ path: value })}
          />
          <Input
            label="fromOffset"
            value={String(operation.fromOffset)}
            onChange={(value) =>
              onPatch({ fromOffset: numberOrUndefined(value) })
            }
          />
          <Input
            label="toOffset"
            value={String(operation.toOffset)}
            onChange={(value) => onPatch({ toOffset: numberOrUndefined(value) })}
          />
        </>
      )}

      {operation.type === "scale" && (
        <>
          <Input
            label="from"
            value={String(operation.from)}
            onChange={(value) => onPatch({ from: numberOrUndefined(value) })}
          />
          <Input
            label="to"
            value={String(operation.to)}
            onChange={(value) => onPatch({ to: numberOrUndefined(value) })}
          />
        </>
      )}
    </div>
  );
}
