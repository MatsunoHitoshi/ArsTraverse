import type { Locale } from "i18n/routing";

export function getClusterTitlePrompt(
  locale: Locale,
  formattedTexts: string,
): string {
  if (locale === "en") {
    return `Analyze the following annotations comprehensively and generate a short title (within 10 characters) that represents this group of annotations. Respond in English.

${formattedTexts}

Title representing the above annotations:`;
  }

  return `以下の複数の注釈の内容を総合的に分析して、これらの注釈を代表する短いタイトル（10文字以内）を生成してください。日本語で回答してください。

${formattedTexts}

上記の注釈群を代表するタイトル:`;
}

export function getAnnotationLabel(locale: Locale, index: number): string {
  return locale === "en" ? `Annotation ${index + 1}` : `注釈${index + 1}`;
}

export function getDefaultClusterTitle(
  locale: Locale,
  clusterId: number,
): string {
  return locale === "en" ? `Cluster ${clusterId}` : `クラスター ${clusterId}`;
}
