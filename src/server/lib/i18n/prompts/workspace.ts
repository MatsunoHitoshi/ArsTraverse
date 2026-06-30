import type { Locale } from "i18n/routing";

export function getNodeRelatedInfoHeader(
  locale: Locale,
  node: { id: string; name: string; label: string },
): string {
  return locale === "en"
    ? `### (ID: ${node.id}, name: ${node.name}, label: ${node.label}) \n#### Related node information\n`
    : `### (ID: ${node.id}, name: ${node.name}, label: ${node.label}) \n#### ノードの関連情報\n`;
}

export function getTextCompletionDeepPrompt(
  locale: Locale,
  params: {
    topicSpaceId?: string;
    hasTools: boolean;
    searchEntities?: string[];
    baseText: string;
  },
): string {
  const { topicSpaceId, hasTools, searchEntities, baseText } = params;
  const toolHint =
    hasTools && topicSpaceId
      ? locale === "en"
        ? `Use the tool "context-search ${topicSpaceId}" to search for the entities below, also using relationship and mention searches, `
        : `ツール「context-search ${topicSpaceId}」を利用してこれから示すエンティティについて検索を行い、関係性や具体的な言及箇所の検索も併用しながら、`
      : "";

  const entityLine =
    searchEntities && searchEntities.length > 0
      ? locale === "en"
        ? `\nEntities to search: ${searchEntities.join(", ")}`
        : `\n検索するエンティティ：${searchEntities.join(", ")}`
      : "";

  if (locale === "en") {
    return `You are an expert at writing logical, clear prose with proper context. ${toolHint}complete the part marked [complete here] as a continuation of the text below. Always refer to the mentioned passages while generating. Output only the text for [complete here]. Ensure the continuation flows naturally from the original text.
          ${entityLine}
          \n===Text===\n${baseText} [complete here]`;
  }

  return `あなたは、文脈を踏まえながら論理的でわかりやすい文章を執筆する専門家です。${toolHint}これから示すテキストの続きである、[ここを補完する]に当てはまる部分を補完してください。必ず言及されている箇所の文章も参照しながら文章を生成してください。応答として出力するのは[ここを補完する]に入る文章だけにしてください。必ず、元の文章と[ここを補完する]の部分が自然につながるように文章を生成してください。
          ${entityLine}
          \n===テキスト===\n${baseText} [ここを補完する]`;
}

export function getTextCompletionBasicPrompt(
  locale: Locale,
  params: { baseText: string; baseContexts: string },
): string {
  const { baseText, baseContexts } = params;

  if (locale === "en") {
    return `You are an expert at writing logical, clear prose with proper context. Complete only one sentence for the part marked [complete here] as a continuation of the text below. Output only the sentence for [complete here]. Refer to related information as needed. Ensure the continuation flows naturally from the original text.
          \n===Text===\n${baseText} [complete here]
          \n===Related information===\n${baseContexts}`;
  }

  return `あなたは、文脈を踏まえながら論理的でわかりやすい文章を執筆する専門家です。これから示すテキストの続きである、[ここを補完する]に当てはまる部分を1文だけ補完してください。応答として出力するのは[ここを補完する]の部分の文章だけにしてください。必要に応じて関連情報も参照しながら文章を生成してください。必ず、元の文章と[ここを補完する]の部分が自然につながるように文章を生成してください。
          \n===テキスト===\n${baseText} [ここを補完する]
          \n===関連情報===\n${baseContexts}`;
}

export function getTextCompletionFallbackPrompt(
  locale: Locale,
  baseText: string,
): string {
  if (locale === "en") {
    return `Complete only one sentence for the part marked [complete here] as a continuation of the text below. Output only the sentence for [complete here]. Ensure the continuation flows naturally from the original text.\n${baseText} [complete here]`;
  }
  return `以下のテキストの続きである、[ここを補完する]に当てはまる部分を1文だけ補完してください。応答として出力するのは、[ここを補完する]の部分の文章だけにしてください。必ず、元の文章と[ここを補完する]の部分が自然につながるように文章を生成してください。\n${baseText} [ここを補完する]`;
}

export function getTextCompletionWithGraphPrompt(
  locale: Locale,
  params: { baseText: string; graphContextText: string },
): string {
  const { baseText, graphContextText } = params;

  if (locale === "en") {
    return `You are an expert in knowledge graph description. Using only the relationships in [Graph context] below as evidence, faithfully articulate the graph's logical structure in prose. Do not go beyond the facts in [Graph context]. Output 1–3 sentences.
===Style reference (tone only)===
${baseText}
===Graph context===
${graphContextText}`;
  }

  return `あなたは知識グラフ記述の専門家です。以下の[グラフ文脈]に含まれる関係のみを根拠に、グラフの論理構造を忠実に文章化してください。事実は[グラフ文脈]の範囲を超えないでください。出力は1〜3文程度。
===スタイル参照(文体のみ)===
${baseText}
===グラフ文脈===
${graphContextText}`;
}

export function getTextCompletionWithGraphFallbackPrompt(
  locale: Locale,
  params: { baseText: string; graphContextText: string },
): string {
  const { baseText, graphContextText } = params;

  if (locale === "en") {
    return `Using only the relationships in [Graph context] as evidence, write a short explanation (1–3 sentences) of the logical structure. Match the tone of [Style reference].
===Style reference===
${baseText}
===Graph context===
${graphContextText}`;
  }

  return `以下の[グラフ文脈]の関係だけを根拠に、その論理構造を説明する短い文章(1〜3文)を書いてください。文体は[スタイル参照]に寄せてください。
===スタイル参照(文体のみ)===
${baseText}
===グラフ文脈===
${graphContextText}`;
}
