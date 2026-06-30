import type { AnnotationType } from "@prisma/client";

export const getAnnotationTypeColor = (type: AnnotationType): string => {
  switch (type) {
    case "COMMENT":
      return "bg-blue-100 text-blue-800";
    case "INTERPRETATION":
      return "bg-purple-100 text-purple-800";
    case "QUESTION":
      return "bg-yellow-100 text-yellow-800";
    case "CLARIFICATION":
      return "bg-green-100 text-green-800";
    case "CRITICISM":
      return "bg-red-100 text-red-800";
    case "SUPPORT":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const ANNOTATION_TYPE_KEYS: Record<AnnotationType, string> = {
  COMMENT: "comment",
  INTERPRETATION: "interpretation",
  QUESTION: "question",
  CLARIFICATION: "clarification",
  CRITICISM: "criticism",
  SUPPORT: "support",
};

const FALLBACK_ANNOTATION_TYPE_LABELS: Record<AnnotationType, string> = {
  COMMENT: "Comment",
  INTERPRETATION: "Interpretation",
  QUESTION: "Question",
  CLARIFICATION: "Clarification",
  CRITICISM: "Criticism",
  SUPPORT: "Support",
};

export type AnnotationTypeTranslator = (
  key: (typeof ANNOTATION_TYPE_KEYS)[AnnotationType],
) => string;

export const getAnnotationTypeLabel = (
  type: AnnotationType,
  t?: AnnotationTypeTranslator,
): string => {
  const key = ANNOTATION_TYPE_KEYS[type];
  if (t && key) {
    return t(key);
  }
  return FALLBACK_ANNOTATION_TYPE_LABELS[type] ?? type;
};
