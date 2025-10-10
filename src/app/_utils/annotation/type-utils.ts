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

export const getAnnotationTypeLabel = (type: AnnotationType): string => {
  switch (type) {
    case "COMMENT":
      return "コメント";
    case "INTERPRETATION":
      return "解釈";
    case "QUESTION":
      return "質問";
    case "CLARIFICATION":
      return "補足";
    case "CRITICISM":
      return "批評";
    case "SUPPORT":
      return "支持";
    default:
      return type;
  }
};
