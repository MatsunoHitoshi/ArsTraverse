import {
  CDT_ANIMATION_MAP,
  type CdtCategory,
  type EdgeMotionConfig,
} from "@/app/const/edge-cdt-animation";

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

/** LLM 分類入力: 述語（edgeType）のみ。ノード情報は含めない */
export type EdgeMotionClassificationInput = {
  edgeId: string;
  edgeType: string;
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
      /^(WORKS?_AT|WORKED_AT|MEMBER_OF|PART_OF|HAS_|INCLUDES|FOUNDED|CREATED_BY|DESIGNED_BY|MANAGED_BY|EDITED_BY|ORGANIZED_BY|TEACHER_OF|STUDENT_OF|PARENT_OF|HAS_MEMBER|MEMBER$|JOINED|MERGED_WITH|ASSIGNED|LEADS|LED_BY|HAS_PROGRAM|HAS_EVENT|HAS_DOCUMENTATION|HAS_CONCEPT|HAS_ORGANIZATION|HAS_STUDENT|HAS_MEMBER|HAS_PART|HAS_RELATIONSHIP|HAS_GUEST|HAS_EDITOR|HAS_CHAIRMAN|HAS_OPERATIONS|HAS_PLANNING|HAS_PUBLIC|HAS_SECRETARY|HAS_ADVISOR|HAS_SISTER|FOUNDED_BY|PUBLISHED_BY|CURATED_BY|DIRECTED_BY|ASSISTED_BY|MENTORED_BY|PROMOTED_BY|COLLECTED_BY|ESTABLISHED_BY)/.test(
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
    test: (p) =>
      /^(SEPARATED|EXPEL|RELEASED|SPLIT|DISSOLVED|EXPELLED)/.test(p),
    category: "EXPEL",
  },
  {
    test: (p) =>
      /^(CONNECTS|COLLABORAT|ASSISTED|TOUCHED|APPROACHED|PARTICIPATED|HOSTED|ORGANIZED$|ORGANIZES|CO_ORGANIZED|CO-ORGANIZED|INTERACTS|COLLABORATED|ASSISTED_IN|SHOOK|WAVED)/.test(
        p,
      ),
    category: "MOVE",
  },
  {
    test: (p) =>
      /^(ASSOCIATED_WITH|RELATED_TO|INVOLVED|INVOLVES|INVOLVED_IN|LINKED_TO|CONNECTED_TO|ALIAS|ALSO_KNOWN|COVERS|FEATURED|CENTRAL_FIGURE|CENTERED|ENGAGED|INTERACTS_WITH|USES|HAS$)/.test(
        p,
      ),
    category: "MENTAL",
  },
];

export function inferCdtCategoryFromPredicate(predicate: string): CdtCategory | null {
  const key = predicate.trim().toUpperCase();
  if (!key) return null;
  for (const { test, category } of PREDICATE_CDT_PATTERNS) {
    if (test(key)) return category;
  }
  return null;
}

function normalizeCategoryToken(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z_]/g, "");
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
  return `Classify each edge predicate into exactly ONE CDT category.

Allowed cdtCategory values (use ONLY these eight strings, uppercase):
PTRANS, ATRANS, PROPEL, MOVE, INGEST, EXPEL, SPEAK, MENTAL

Do NOT put the predicate text in cdtCategory. Example: predicate "LOCATED_IN" → cdtCategory "PTRANS".

${edges.map((e) => `{"edgeId":"${e.edgeId}","predicate":"${e.edgeType}"}`).join("\n")}`;
}

export function buildMotionConfigFromCategory(
  category: CdtCategory,
): EdgeMotionConfig & { category: CdtCategory } {
  const base = CDT_ANIMATION_MAP[category] ?? CDT_ANIMATION_MAP.MENTAL;
  return { ...base, category };
}

export const CLASSIFY_EDGE_MOTION_SYSTEM_PROMPT = `You classify knowledge-graph edge predicates into Schank's Conceptual Dependency Theory (CDT).

Output ONLY valid JSON (no markdown):
{"classifications":[{"edgeId":"...","cdtCategory":"PTRANS"},...]}

Rules:
- cdtCategory MUST be exactly one of: PTRANS, ATRANS, PROPEL, MOVE, INGEST, EXPEL, SPEAK, MENTAL
- NEVER use the predicate string as cdtCategory (wrong: "LOCATED_IN", "WORKS_AT", "ASSOCIATED_WITH")
- Map predicates by meaning:
  - PTRANS: physical location change (LOCATED_IN, VISITED, MOVED_TO, BORN_IN, TRAVELED_TO, HELD_AT, EXHIBITED_AT)
  - ATRANS: ownership/membership/role transfer (WORKS_AT, MEMBER_OF, CREATED_BY, PART_OF, HAS_MEMBER, FOUNDED, MANAGED_BY)
  - PROPEL: conflict/force (ATTACKED, FOUGHT, AFFECTED_BY)
  - MOVE: interaction/approach (PARTICIPATED_IN, HOSTED, CONNECTS, COLLABORATED_WITH)
  - INGEST: absorption/merger (MERGED_WITH, ABSORBED)
  - EXPEL: separation (SPLIT, RELEASED)
  - SPEAK: communication (SAID, WROTE, MENTIONED_IN, ANNOUNCED)
  - MENTAL: abstract association/cognition (ASSOCIATED_WITH, RELATED_TO, INVOLVED, INSPIRED_BY, KNOWN_FOR)`;

export type UniquePredicateGroup = {
  representative: EdgeMotionClassificationInput;
  edgeIds: string[];
};

/** 述語ごとに代表 edgeId を1つ選び、バッチに分割する */
export function buildUniquePredicateBatches(
  edges: EdgeMotionClassificationInput[],
  batchSize = CLASSIFY_EDGE_MOTION_BATCH_SIZE,
): UniquePredicateGroup[][] {
  const byPredicate = new Map<string, { edgeType: string; edgeIds: string[] }>();

  for (const edge of edges) {
    const key = edge.edgeType.trim().toUpperCase();
    if (!key) continue;
    const existing = byPredicate.get(key);
    if (existing) {
      existing.edgeIds.push(edge.edgeId);
    } else {
      byPredicate.set(key, { edgeType: edge.edgeType, edgeIds: [edge.edgeId] });
    }
  }

  const groups = [...byPredicate.values()].map((g) => ({
    representative: {
      edgeId: g.edgeIds[0]!,
      edgeType: g.edgeType,
    },
    edgeIds: g.edgeIds,
  }));

  const batches: typeof groups[] = [];
  for (let i = 0; i < groups.length; i += batchSize) {
    batches.push(groups.slice(i, i + batchSize));
  }
  return batches;
}
