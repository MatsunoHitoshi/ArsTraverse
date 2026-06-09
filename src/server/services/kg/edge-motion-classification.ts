import {
  CDT_ANIMATION_MAP,
  type CdtCategory,
  type EdgeMotionConfig,
} from "@/app/const/edge-cdt-animation";
import {
  GENERATIVE_MOTION_PLAN_RENDERER_VERSION,
  normalizeGenerativeMotionPlan,
  type MotionPlanContext,
} from "@/app/const/generative-motion-plan";
import {
  validateHumanMotionPlan,
  type DirectionHint,
  type MotionPlanValidationResult,
} from "@/app/const/motion-intent";
import type { MotionStoryboardItem } from "./motion-llm-schema";

/** CDT 分類 + generative motionPlan 用 OpenAI モデル（`EDGE_MOTION_LLM_MODEL` で上書き可） */
export const EDGE_MOTION_LLM_MODEL =
  process.env.EDGE_MOTION_LLM_MODEL ?? "gpt-5.4";

export const CDT_VALID_CATEGORIES = new Set<string>([
  "PTRANS",
  "ATRANS",
  "PROPEL",
  "MOVE",
  "INGEST",
  "EXPEL",
  "SPEAK",
  "MENTAL",
]);

/** LLM 分類入力: 述語に加えて、具象アセット選択用の端点ノード情報を任意で含める */
export type EdgeMotionClassificationInput = {
  edgeId: string;
  edgeType: string;
  sourceName?: string;
  sourceLabel?: string;
  targetName?: string;
  targetLabel?: string;
  /** Scene-derived facing: right/left/auto. LLM must honor this over guessing. */
  directionHint?: DirectionHint;
};

/** 1 LLM リクエストあたりの最大述語数（ユニーク述語） */
export const CLASSIFY_EDGE_MOTION_BATCH_SIZE = 40;

/**
 * KG 述語（UPPER_SNAKE_CASE）から CDT を推定するヒューリスティック。
 * LLM が述語名を cdtCategory にそのまま返した場合のフォールバックにも使う。
 */
const PREDICATE_CDT_PATTERNS: Array<{
  test: (predicate: string) => boolean;
  category: CdtCategory;
}> = [
  {
    test: (p) =>
      /^(LOCATED_|BORN_|DIED_|MOVED_|TRAVELED_|VISITED$|VISITED_|TRANSPORT|EVACUATED|RESIDES?_|LIVES_|HELD_AT|EXHIBITED_AT|OCCURRED_|BASED_AT|HOUSED_|BURIED_|STARTED_IN|RETURNED_TO|REOPENED|GRADUATED_FROM|STUDIED_AT|STUDENT_AT|EDUCATED_AT)/.test(
        p,
      ),
    category: "PTRANS",
  },
  {
    test: (p) =>
      /^(WORKS?_AT|WORKED_AT|MEMBER_OF|PART_OF|HAS_|INCLUDES|FEATURED_IN|FEATURED_AT|HOSTED|HOSTS|FOUNDED|CREATED_BY|DESIGNED_BY|MANAGED_BY|EDITED_BY|ORGANIZED_BY|TEACHER_OF|STUDENT_OF|PARENT_OF|HAS_MEMBER|MEMBER$|JOINED|MERGED_WITH|ASSIGNED|LEADS|LED_BY|HAS_PROGRAM|HAS_EVENT|HAS_DOCUMENTATION|HAS_CONCEPT|HAS_ORGANIZATION|HAS_STUDENT|HAS_MEMBER|HAS_PART|HAS_RELATIONSHIP|HAS_GUEST|HAS_EDITOR|HAS_CHAIRMAN|HAS_OPERATIONS|HAS_PLANNING|HAS_PUBLIC|HAS_SECRETARY|HAS_ADVISOR|HAS_SISTER|FOUNDED_BY|PUBLISHED_BY|CURATED_BY|DIRECTED_BY|ASSISTED_BY|MENTORED_BY|PROMOTED_BY|COLLECTED_BY|ESTABLISHED_BY)/.test(
        p,
      ),
    category: "ATRANS",
  },
  {
    test: (p) =>
      /^(ATTACKED|FOUGHT|AFFECTED_BY|WON|INTERRUPTED|STRIKED|DEFEATED|CRITICIZED|COMPETED)/.test(
        p,
      ),
    category: "PROPEL",
  },
  {
    test: (p) =>
      /^(SAID|ANNOUNCED|MENTIONED_|MENTIONS|WROTE|PUBLISHED|SPEAK|DECLARED|CLAIMED|INTERVIEWED|CONSULTED|INTRODUCED|CELEBRATED|ASSIGNED|RECOMMENDED)/.test(
        p,
      ),
    category: "SPEAK",
  },
  {
    test: (p) =>
      /^(THOUGHT|BELIEVED|KNOWS|KNOWN_FOR|INSPIRED|INSPIRED_BY|REFLECTS_ON|SYMBOL_OF|DREAMED|INFLUENCED|INFLUENCED_BY|UNDERSTOOD|RECOGNIZED|PLANNED|PROPOSED|JUDGED|INSPIRED$|MENTAL|CONCEPT)/.test(
        p,
      ),
    category: "MENTAL",
  },
  {
    test: (p) =>
      /^(ABSORBED|INGEST|MERGED_INTO|INCORPORATED|ACQUIRED|CONTAINS|INCLUDES_ENTITY)/.test(
        p,
      ),
    category: "INGEST",
  },
  {
    test: (p) => /^(SEPARATED|EXPEL|RELEASED|SPLIT|DISSOLVED|EXPELLED)/.test(p),
    category: "EXPEL",
  },
  {
    test: (p) =>
      /^(CONNECTS|COLLABORAT|ASSISTED|TOUCHED|APPROACHED|PARTICIPATED|ORGANIZED$|ORGANIZES|CO_ORGANIZED|CO-ORGANIZED|INTERACTS|COLLABORATED|ASSISTED_IN|SHOOK|WAVED)/.test(
        p,
      ),
    category: "MOVE",
  },
  {
    test: (p) =>
      /^(ASSOCIATED_WITH|RELATED_TO|INVOLVED|INVOLVES|INVOLVED_IN|LINKED_TO|CONNECTED_TO|ALIAS|ALSO_KNOWN|COVERS|CENTRAL_FIGURE|CENTERED|ENGAGED|INTERACTS_WITH|USES|HAS$)/.test(
        p,
      ),
    category: "MENTAL",
  },
];

export function inferCdtCategoryFromPredicate(
  predicate: string,
): CdtCategory | null {
  const key = predicate.trim().toUpperCase();
  if (!key) return null;
  for (const { test, category } of PREDICATE_CDT_PATTERNS) {
    if (test(key)) return category;
  }
  return null;
}

function normalizeCategoryToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]/g, "");
}

/**
 * LLM 出力の cdtCategory を正規化する。
 * - 大文字・表記ゆれ（ATrans → ATRANS）を吸収
 * - 述語名がそのまま返された場合はヒューリスティックで補正
 */
export function normalizeCdtCategory(
  raw: string | undefined,
  predicate?: string,
): CdtCategory {
  const token = raw ? normalizeCategoryToken(raw) : "";

  if (CDT_VALID_CATEGORIES.has(token)) {
    return token as CdtCategory;
  }

  // 表記ゆれ: ATRANS の亜種
  if (token === "ATRANS" || token.startsWith("ATRANS")) {
    return "ATRANS";
  }

  // LLM が述語を cdtCategory に返した（LOCATED_IN, WORKS_AT など）
  const fromToken = inferCdtCategoryFromPredicate(token);
  if (fromToken) return fromToken;

  if (predicate) {
    const fromPredicate = inferCdtCategoryFromPredicate(predicate);
    if (fromPredicate) return fromPredicate;
  }

  // 最終フォールバック（旧実装は常に MENTAL だった）
  return "ATRANS";
}

export function buildClassifyEdgeMotionUserPrompt(
  edges: EdgeMotionClassificationInput[],
): string {
  return `Classify each knowledge-graph edge into exactly ONE CDT category and provide a safe motionPlan.

Allowed cdtCategory values (use ONLY these eight strings, uppercase):
PTRANS, ATRANS, PROPEL, MOVE, INGEST, EXPEL, SPEAK, MENTAL

Do NOT put the predicate text in cdtCategory. Example: predicate "LOCATED_IN" → cdtCategory "PTRANS".

motionPlan must follow this whitelist:
- version: "motion-plan/v1"
- rendererVersion: ${GENERATIVE_MOTION_PLAN_RENDERER_VERSION}
- Required shape: motionPlan.semantic, motionPlan.participants, motionPlan.asset, motionPlan.recipe, motionPlan.playback
- semantic must be an object like {"intent":"organization presents an event","confidence":0.7}. Do not copy this example literally.
- participants must be an object using ONLY these enums:
  - sourceRole: actor, sender, container, speaker, thinker, unknown
  - targetRole: recipient, destination, object, listener, concept, unknown
  - primaryTarget: source, target, edgeGlyph, transferredObject, bothNodes
  - direction: sourceToTarget, targetToSource, bidirectional, inward, outward, none
- asset must include kind and assetId. If asset.kind is "human", include at least one human.* operation in recipe.operations.
- playback must include durationMs, loop, yoyo, easing, intensity.
- recipe.preset: path, disappearReappear, pathAndDisappear, appearAndPath, dialogueBubble, thoughtBubble, bodyPartMotion, impactMotion, ambientGlow
- Put operations ONLY in motionPlan.recipe.operations. Do NOT create top-level motionPlan.operations.
- recipe.operations[].type: pathMovement, scale, rotation, flip, appearance, disappearance
- Do not invent operation types. "reaction" is a role, not an operation type.
- recipe.operations[].target: sourceNode, targetNode, edgeGlyph, transferredObject, speechBubble, thoughtBubble, human.head, human.body, human.leftArm, human.rightArm, human.leftLeg, human.rightLeg
- recipe.operations[] are the primary animation instructions. Always return 3-6 concrete operations.
- When asset.kind is "human", target AT LEAST 3 different body parts among human.head/body/leftArm/rightArm/leftLeg/rightLeg. A lone "human.body" is NOT enough; the figure must visibly articulate.
- ALWAYS include a human.head operation (even if subtle) so the face is not frozen. For walking use a small rotation 3-6° at origin "neck"; for speaking 4-8°; for thinking 4-6° with easing "breath".
- human.body pathMovement causes the entire figure (head + limbs) to bob together. Pair it with arm/leg rotations so the limbs swing while the whole figure bobs.
- For locomotion-like actions (walking, participating, approaching, visiting), use a CONTRALATERAL walk cycle: leftLeg and rightArm share phase 0; rightLeg and leftArm share phase 0.5. Mirror the fromDegrees/toDegrees within each diagonal pair. Do NOT make both arms swing in the same phase as both legs (that produces a marching ipsilateral gait, which looks unnatural).
- For reach/give/take actions (ATRANS, ATRANS-like gestures), rotate the dominant human.rightArm wider (fromDegrees around -10..-20, toDegrees around 28..40, origin "shoulder") and add a small counter-rotation on human.leftArm.
- For impact (PROPEL), strike with human.rightArm using a wide rotation (fromDegrees -30, toDegrees 45+, origin "shoulder") plus a body lean (rotation on human.body, origin "hip") and an edgeGlyph scale "impact" pulse.
- For SPEAK, combine a small human.head rotation (origin "neck") with a human.rightArm gesture (origin "shoulder") and a speechBubble appearance + scale.
- rotation.origin must be one of: "center", "shoulder", "hip", "neck", "custom". Choose anatomically: shoulder for arms, hip for legs/body lean, neck for head.
- recipe.operations[].role: anticipation, action, reaction, effect, idle
- recipe.operations[].timing: {"start":0..1,"duration":0.05..1}
- recipe.operations[].repeat: loop, once, yoyo
- Use phase:0.5 on the second leg/arm of a counter-phase pair so left/right alternate in time.
- rotation should prefer fromDegrees/toDegrees over generic degrees when the gesture has a clear start and end. Magnitudes: idle 5-10°, conversational 8-20°, walk/swing 18-28°, impact 30-55°.
- pathMovement should prefer numeric fromOffset/toOffset at the same level as type/target. Do not use {"x":0,"y":0}. Magnitudes: subtle body bob 3-5, locomotion 8-14, impact 12-20.
- For continuous edge effects (pathMovement, scale) on edgeGlyph/transferredObject/speechBubble/thoughtBubble, prefer repeat: "loop" or "yoyo" (NOT "once") so the animation keeps cycling. Use "once" only for first-frame appearance/disappearance lifecycle effects.
- Set playback.loop=true and playback.yoyo=true unless you have a strong reason to play the gesture exactly once.
- scale must use numeric from/to at the same level as type/target. Do not nest under scale.
- Use asset.kind "human" ONLY when source.label or target.label is Person/Human/Character/Artist/Creator. If both endpoints are Organization/Event/Place/Project, NEVER use human.* targets.
- For non-human endpoints, prefer edgeGlyph, transferredObject, sourceNode, targetNode, speechBubble, or thoughtBubble operations.
- Never include SVG, JavaScript, CSS, HTML, or arbitrary code.
- motionPlan.motionIntent (optional object): {"style":"run|fight|dance|wave|reach|speak|idle","energy":0.0..1.0,"dominantSide":"left|right|both|none","tempo":"slow|normal|fast","symmetry":"mirror|offset|asymmetric","contactEmphasis":true|false,"directionHint":"right|left|auto|unknown"}
- When directionHint is provided on the input edge, copy it to motionPlan.motionIntent.directionHint and align dominantSide / body lean accordingly. Do NOT override directionHint with your own guess.
- For run/locomotion with directionHint "right": use assetId "human-runner-right", preset "bodyPartMotion", prefer 4-phase rotation keyframes on legs/arms/body bob.
- For fight (PROPEL / ATTACKED / FOUGHT): style "fight", impact easing on dominant arm, body lean, edgeGlyph scale pulse.
- For dance (DANCED_WITH / PERFORMED): style "dance", stagger phase across limbs, loop repeat, body bob.
- For wave (WAVED_TO): style "wave", one dominant arm with yoyo, subtle head rotation.

Input edges:
${edges
  .map((e) =>
    JSON.stringify({
      edgeId: e.edgeId,
      predicate: e.edgeType,
      directionHint: e.directionHint ?? "auto",
      source: { name: e.sourceName ?? "", label: e.sourceLabel ?? "" },
      target: { name: e.targetName ?? "", label: e.targetLabel ?? "" },
    }),
  )
  .join("\n")}`;
}

export function buildMotionConfigFromCategory(
  category: CdtCategory,
  predicate = "",
  rawMotionPlan?: unknown,
  context?: MotionPlanContext,
): EdgeMotionConfig & { category: CdtCategory } {
  const base = CDT_ANIMATION_MAP[category] ?? CDT_ANIMATION_MAP.MENTAL;
  return {
    ...base,
    category,
    generativeMotionPlan: normalizeGenerativeMotionPlan(
      rawMotionPlan,
      category,
      predicate,
      context,
    ),
  };
}

export function buildMotionConfigWithValidation(
  category: CdtCategory,
  predicate = "",
  rawMotionPlan?: unknown,
  context?: MotionPlanContext,
): {
  motionConfig: EdgeMotionConfig & { category: CdtCategory };
  validation: MotionPlanValidationResult;
} {
  const motionConfig = buildMotionConfigFromCategory(
    category,
    predicate,
    rawMotionPlan,
    context,
  );
  const plan = motionConfig.generativeMotionPlan;
  const validation = plan
    ? validateHumanMotionPlan(plan, context)
    : { ok: false, errors: [], warnings: [] };
  return { motionConfig, validation };
}

export const CLASSIFY_EDGE_MOTION_SYSTEM_PROMPT = `You classify knowledge-graph edge predicates into Schank's Conceptual Dependency Theory (CDT).

Output ONLY valid JSON (no markdown):
{"classifications":[{"edgeId":"...","cdtCategory":"PTRANS","motionPlan":{...}},...]}

Rules:
- cdtCategory MUST be exactly one of: PTRANS, ATRANS, PROPEL, MOVE, INGEST, EXPEL, SPEAK, MENTAL
- NEVER use the predicate string as cdtCategory (wrong: "LOCATED_IN", "WORKS_AT", "ASSOCIATED_WITH")
- Return strict JSON only: double-quoted keys and strings, no trailing commas, no comments, no single quotes, no JavaScript object literal syntax.
- motionPlan MUST be a compact JSON object using ONLY the provided whitelist. It is a declarative plan, not code.
- motionPlan.rendererVersion MUST be ${GENERATIVE_MOTION_PLAN_RENDERER_VERSION}
- motionPlan.recipe.operations is required and must contain all operations. Never put operations directly under motionPlan.
- motionPlan.semantic and motionPlan.participants must be JSON objects, not strings or arrays.
- participants values must use the enum tokens provided in the user prompt, never node labels or natural-language words like "to".
- playback values must be concrete, e.g. {"durationMs":1600,"loop":true,"yoyo":true,"easing":"easeInOut","intensity":0.6}.
- If motionPlan.asset.kind is "human", target AT LEAST 3 distinct body parts in recipe.operations so the figure visibly articulates (e.g. head + both arms, or both legs + one arm).
- Locomotion (PTRANS/MOVE) for a human MUST include rotations on human.leftLeg AND human.rightLeg with mirrored fromDegrees/toDegrees and phase:0.5 on one of them, plus counter-phase arm swings.
- Reaching/giving (ATRANS) for a human MUST include a dominant rotation on human.rightArm with origin "shoulder" plus a counter-motion on human.leftArm.
- Impact (PROPEL) for a human MUST include a wide-angle human.rightArm rotation (origin "shoulder") plus a body lean rotation (origin "hip") plus an edgeGlyph effect.
- Base motionPlan on DancingBoard's design space: combine CDT with atomic operations pathMovement, scale, rotation, flip, appearance, disappearance.
- The renderer executes operations first. preset is only a coarse fallback/template label.
- Always include 3-6 concrete operations with role and timing. Use:
  - anticipation for wind-up or preparation
  - action for the main body motion (legs/arms/body)
  - effect for edge glyph / transferred object / bubble effects
  - reaction for target node response
- Prefer explicit values: rotation.fromDegrees/toDegrees, pathMovement.fromOffset/toOffset, scale.from/to.
- Keep numeric motion values flat in each operation, e.g. {"type":"scale","target":"edgeGlyph","from":0.9,"to":1.2}, not {"scale":{"from":0.9,"to":1.2}}.
- Asset rule: use asset.kind "human" only for Person/Human/Character/Artist/Creator endpoints. Organization/Event/Place/Project endpoints should use object, abstract, speech, thought, or concept assets and must not use human.* operation targets.
- Map predicates by meaning:
  - PTRANS: physical location change (LOCATED_IN, VISITED, MOVED_TO, BORN_IN, TRAVELED_TO, HELD_AT, EXHIBITED_AT)
  - ATRANS: ownership/membership/role/inclusion/hosting transfer (WORKS_AT, MEMBER_OF, CREATED_BY, PART_OF, HAS_MEMBER, FOUNDED, MANAGED_BY, HOSTED, FEATURED_IN)
  - PROPEL: conflict/force (ATTACKED, FOUGHT, AFFECTED_BY)
  - MOVE: body-part or direct interaction/approach (PARTICIPATED_IN by a Person, CONNECTS, COLLABORATED_WITH)
  - INGEST: absorption/merger (MERGED_WITH, ABSORBED)
  - EXPEL: separation (SPLIT, RELEASED)
  - SPEAK: communication (SAID, WROTE, MENTIONED_IN, ANNOUNCED)
  - MENTAL: abstract association/cognition (ASSOCIATED_WITH, RELATED_TO, INVOLVED, INSPIRED_BY, KNOWN_FOR)
- Suggested presets by category:
  - PTRANS: path
  - ATRANS: disappearReappear
  - PROPEL: impactMotion
  - MOVE: bodyPartMotion
  - INGEST: pathAndDisappear
  - EXPEL: appearAndPath
  - SPEAK: dialogueBubble
  - MENTAL: thoughtBubble
- Examples:
  - {"predicate":"HOSTED","source":{"label":"Organization"},"target":{"label":"Event"}} => cdtCategory "ATRANS", asset.kind "abstract" or "object", operations on edgeGlyph/transferredObject/targetNode, no human.* targets.
  - {"predicate":"FEATURED_IN","source":{"label":"Person"},"target":{"label":"Event"}} => cdtCategory "ATRANS", asset.kind "human". Sample operations: rotation human.rightArm origin "shoulder" fromDegrees -10 toDegrees 32 (reach), rotation human.leftArm origin "shoulder" fromDegrees 12 toDegrees -8 (counter), rotation human.head origin "neck" fromDegrees -4 toDegrees 6, appearance edgeGlyph mode "popIn".
  - {"predicate":"PARTICIPATED_IN","source":{"label":"Person"},"target":{"label":"Event"}} => cdtCategory "MOVE", asset.kind "human". Sample contralateral walk: rotation human.leftLeg origin "hip" fromDegrees -22 toDegrees 22 phase 0, rotation human.rightArm origin "shoulder" fromDegrees -18 toDegrees 18 phase 0 (same phase 0 as leftLeg), rotation human.rightLeg origin "hip" fromDegrees 22 toDegrees -22 phase 0.5, rotation human.leftArm origin "shoulder" fromDegrees 18 toDegrees -18 phase 0.5 (same phase 0.5 as rightLeg), pathMovement human.body path "jitter" fromOffset -3 toOffset 3.
  - {"predicate":"HELD_AT","source":{"label":"Event"},"target":{"label":"Organization"}} => cdtCategory "PTRANS", asset.kind "object", use edgeGlyph path movement, no human.* targets.
  - {"predicate":"ATTACKED","source":{"label":"Person"},"target":{"label":"Person"}} => cdtCategory "PROPEL", asset.kind "human". Sample: rotation human.rightArm origin "shoulder" fromDegrees -30 toDegrees 48 easing "impact" (punch), rotation human.body origin "hip" fromDegrees -8 toDegrees 10 (lean), scale edgeGlyph from 0.75 to 1.45 easing "impact" (shock), rotation human.leftArm origin "shoulder" fromDegrees 14 toDegrees -14 (counter).
  - {"predicate":"DANCED_WITH","directionHint":"auto","source":{"label":"Person"},"target":{"label":"Person"}} => cdtCategory "MOVE", motionIntent.style "dance", asset.kind "human". Sample: rotation human.leftArm phase 0, rotation human.rightArm phase 0.25, rotation human.leftLeg phase 0.5, pathMovement human.body jitter loop.
  - {"predicate":"SAID","source":{"label":"Person"},"target":{"label":"Person"}} => cdtCategory "SPEAK", asset.kind "human". Sample: appearance speechBubble mode "popIn", scale speechBubble from 0.85 to 1.18, rotation human.head origin "neck" fromDegrees -4 toDegrees 6, rotation human.rightArm origin "shoulder" fromDegrees 4 toDegrees 24.`;

export const STAGE_A_SYSTEM_PROMPT = `You are a motion director for knowledge-graph edge animations.

Classify each edge into exactly ONE CDT category and describe the performance in natural language.
Do NOT output numeric angles, operations, or playback values.

CDT categories (uppercase only): PTRANS, ATRANS, PROPEL, MOVE, INGEST, EXPEL, SPEAK, MENTAL
NEVER use the predicate string as cdtCategory.

motionIntent.style must be one of: run, fight, dance, wave, reach, speak, idle
- run: locomotion (PARTICIPATED_IN, VISITED, MOVED_TO, etc. by a Person)
- fight: conflict/force (ATTACKED, FOUGHT, PROPEL)
- dance: DANCED_WITH, PERFORMED
- wave: WAVED_TO, SHOOK
- reach: giving/taking/hosting gestures (ATRANS, FEATURED_IN)
- speak: SAID, ANNOUNCED, WROTE
- idle: abstract/low-motion associations

assetHint.kind rules:
- "human" only when source.label or target.label is Person/Human/Character/Artist/Creator
- Organization/Event/Place/Project endpoints: object, abstract, speech, thought, or concept

When directionHint is provided on input, copy it to motionIntent.directionHint. Do NOT override.

storyboard: 1-3 sentences describing the visible performance (Japanese or English).
requiredParts: body parts or targets needed (e.g. rightArm, body, head, edgeGlyph).

Examples:
- PARTICIPATED_IN Person→Event, directionHint right → cdtCategory MOVE, style run, storyboard "作家が右向きにイベントへ走って参加する"
- ATTACKED Person→Person → cdtCategory PROPEL, style fight, requiredParts ["rightArm","body","head","edgeGlyph"]
- HOSTED Organization→Event → cdtCategory ATRANS, assetHint.kind abstract, requiredParts ["edgeGlyph"]`;

export const STAGE_B_FIGHT_SYSTEM_PROMPT = `You convert a fight/impact storyboard into a motionPlan with concrete operations.

Rules:
- version "motion-plan/v1", rendererVersion ${GENERATIVE_MOTION_PLAN_RENDERER_VERSION}
- preset "impactMotion", asset.kind "human" when storyboard implies a person actor
- 3-8 operations with role and timing windows:
  - anticipation (timing.start 0..0.15): wind-up, head tilt, counter-arm
  - action (timing.start 0.12..0.35): dominant arm strike, body lean at hip
  - effect (timing.start 0.2..0.45): edgeGlyph scale pulse with easing "impact"
- Dominant arm: rotation origin "shoulder", fromDegrees around -30, toDegrees 40-55, easing "impact"
- Body lean: rotation human.body origin "hip", fromDegrees -10 to 12
- Counter arm: human.leftArm or human.rightArm opposite side, smaller amplitude
- ALWAYS include human.head (subtle neck rotation)
- Do NOT use keyframes (contact/down/pass/up). Use fromDegrees/toDegrees with yoyo or loop.
- playback: loop true, yoyo true, durationMs 1200-1800, intensity 0.7-0.95
- Never output SVG, CSS, or code`;

export const STAGE_B_DANCE_SYSTEM_PROMPT = `You convert a dance storyboard into a motionPlan with concrete operations.

Rules:
- version "motion-plan/v1", rendererVersion ${GENERATIVE_MOTION_PLAN_RENDERER_VERSION}
- preset "bodyPartMotion", asset.kind "human"
- 4-8 operations with staggered phase across limbs (0, 0.25, 0.5, 0.75)
- Include human.leftArm, human.rightArm, human.leftLeg or human.body bob
- pathMovement human.body path "jitter" amplitude 3-5, repeat loop
- rotation operations: repeat loop or yoyo, easing easeInOut
- ALWAYS include human.head
- Do NOT use keyframes. Use phase offsets and fromDegrees/toDegrees.
- playback: loop true, durationMs 1400-2000, intensity 0.5-0.8`;

export const STAGE_B_GENERAL_SYSTEM_PROMPT = `You convert a storyboard into a safe motionPlan with concrete operations.

Rules:
- version "motion-plan/v1", rendererVersion ${GENERATIVE_MOTION_PLAN_RENDERER_VERSION}
- 3-6 operations using: pathMovement, scale, rotation, flip, appearance, disappearance
- Targets: sourceNode, targetNode, edgeGlyph, transferredObject, speechBubble, thoughtBubble, human.*
- human asset: at least 3 distinct human.* targets including human.head
- wave: one dominant arm yoyo + subtle head rotation
- speak: speechBubble appearance + scale, head + arm gesture
- reach/ATRANS: dominant human.rightArm reach + counter leftArm
- non-human: edgeGlyph/transferredObject path or scale, no human.* targets
- Do NOT use keyframes (contact/down/pass/up)
- playback.loop true unless appearance/disappearance lifecycle
- Never output SVG, CSS, or code`;

export const STAGE_B_NON_HUMAN_SYSTEM_PROMPT = `You convert a storyboard into a motionPlan for non-human assets.

Rules:
- version "motion-plan/v1", rendererVersion ${GENERATIVE_MOTION_PLAN_RENDERER_VERSION}
- asset.kind: object, abstract, concept, speech, or thought (never human)
- 3-5 operations on edgeGlyph, transferredObject, sourceNode, targetNode, speechBubble, thoughtBubble
- No human.* operation targets
- Prefer loop/yoyo for continuous edge effects
- Never output SVG, CSS, or code`;

export function buildStageAUserPrompt(
  edges: EdgeMotionClassificationInput[],
): string {
  return `Classify each edge and produce a motion storyboard (no numeric angles).

Input edges:
${edges
  .map((e) =>
    JSON.stringify({
      edgeId: e.edgeId,
      predicate: e.edgeType,
      directionHint: e.directionHint ?? "auto",
      source: { name: e.sourceName ?? "", label: e.sourceLabel ?? "" },
      target: { name: e.targetName ?? "", label: e.targetLabel ?? "" },
    }),
  )
  .join("\n")}`;
}

export type StageBUserContext = {
  edgeId: string;
  predicate: string;
  directionHint?: DirectionHint;
  sourceName?: string;
  sourceLabel?: string;
  targetName?: string;
  targetLabel?: string;
};

export function buildStageBUserPrompt(
  storyboard: MotionStoryboardItem,
  edge: StageBUserContext,
): string {
  return `Convert this storyboard into a complete motionPlan JSON.

Edge:
${JSON.stringify({
  edgeId: edge.edgeId,
  predicate: edge.predicate,
  directionHint: edge.directionHint ?? "auto",
  source: { name: edge.sourceName ?? "", label: edge.sourceLabel ?? "" },
  target: { name: edge.targetName ?? "", label: edge.targetLabel ?? "" },
})}

Storyboard:
${JSON.stringify({
  cdtCategory: storyboard.cdtCategory,
  motionIntent: storyboard.motionIntent,
  storyboard: storyboard.storyboard,
  requiredParts: storyboard.requiredParts,
  assetHint: storyboard.assetHint,
})}`;
}

export type { MotionStoryboardItem } from "./motion-llm-schema";

export type UniquePredicateGroup = {
  representative: EdgeMotionClassificationInput;
  edgeIds: string[];
};

/** 述語と端点コンテキストごとに代表 edgeId を1つ選び、バッチに分割する */
export function buildUniquePredicateBatches(
  edges: EdgeMotionClassificationInput[],
  batchSize = CLASSIFY_EDGE_MOTION_BATCH_SIZE,
): UniquePredicateGroup[][] {
  const byPredicate = new Map<
    string,
    EdgeMotionClassificationInput & { edgeIds: string[] }
  >();

  for (const edge of edges) {
    const key = [
      edge.edgeType.trim().toUpperCase(),
      edge.sourceName?.trim().toUpperCase() ?? "",
      edge.sourceLabel?.trim().toUpperCase() ?? "",
      edge.targetName?.trim().toUpperCase() ?? "",
      edge.targetLabel?.trim().toUpperCase() ?? "",
      edge.directionHint?.trim().toUpperCase() ?? "",
    ].join("|");
    if (!key) continue;
    const existing = byPredicate.get(key);
    if (existing) {
      existing.edgeIds.push(edge.edgeId);
    } else {
      byPredicate.set(key, { ...edge, edgeIds: [edge.edgeId] });
    }
  }

  const groups = [...byPredicate.values()].map((g) => ({
    representative: {
      edgeId: g.edgeIds[0]!,
      edgeType: g.edgeType,
      sourceName: g.sourceName,
      sourceLabel: g.sourceLabel,
      targetName: g.targetName,
      targetLabel: g.targetLabel,
      directionHint: g.directionHint,
    },
    edgeIds: g.edgeIds,
  }));

  const batches: (typeof groups)[] = [];
  for (let i = 0; i < groups.length; i += batchSize) {
    batches.push(groups.slice(i, i + batchSize));
  }
  return batches;
}
