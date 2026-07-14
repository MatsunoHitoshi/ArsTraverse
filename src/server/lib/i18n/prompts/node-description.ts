import type { Locale } from "i18n/routing";

export function getNodeDescriptionSystemPrompt(locale: Locale): string {
  if (locale === "en") {
    return `You are an expert who explains specialized knowledge in an accessible way. From the given documents, write a concise and easy-to-understand description of the specified node (concept).

Requirements for the description:
- A concise explanation of roughly 120-180 words
- Explain technical terms appropriately
- Accurate information grounded in the documents
- A structure that is easy for the reader to understand
- Write in English`;
  }

  return `あなたは専門的な知識を分かりやすく解説するエキスパートです。与えられた文書から、指定されたノード（概念）について、簡潔で分かりやすい解説文を作成してください。

解説文の要件：
- 200-300文字程度の簡潔な説明
- 専門用語は適切に説明する
- 文書の内容を基にした正確な情報
- 読み手が理解しやすい構成
- 日本語で記述`;
}

export function getNodeDescriptionUserPrompt(
  locale: Locale,
  params: { nodeName: string; nodeLabel: string; referenceText: string },
): string {
  const { nodeName, nodeLabel, referenceText } = params;

  if (locale === "en") {
    return `Node name: ${nodeName}
Node label: ${nodeLabel}

Related documents:
${referenceText}

Based on the documents above, write a description of "${nodeName}".`;
  }

  return `ノード名: ${nodeName}
ノードラベル: ${nodeLabel}

関連文書:
${referenceText}

上記の文書を基に、「${nodeName}」についての解説文を作成してください。`;
}

export function getNodeDescriptionGenerationFailedMessage(
  locale: Locale,
): string {
  return locale === "en"
    ? "Failed to generate the description."
    : "解説文の生成に失敗しました。";
}

export function getNodeDescriptionNoReferenceMessage(locale: Locale): string {
  return locale === "en"
    ? "No related documents were found."
    : "関連する文書が見つかりませんでした。";
}
