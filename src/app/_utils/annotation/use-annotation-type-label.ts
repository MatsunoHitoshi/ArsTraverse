"use client";

import { useTranslations } from "next-intl";
import type { AnnotationType } from "@prisma/client";
import { getAnnotationTypeLabel } from "./type-utils";

export const useAnnotationTypeLabel = () => {
  const t = useTranslations("annotation");
  return (type: AnnotationType) => getAnnotationTypeLabel(type, t);
};
