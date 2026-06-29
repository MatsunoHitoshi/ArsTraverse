import type { Locale } from "i18n/routing";

export function getAnnotateStorySegmentsSystemPrompt(locale: Locale): string {
  return `You are an annotator. Given story segments and a list of node IDs and edge composite keys, output which node IDs and edge keys each segment mentions.

[Output Format]
Valid JSON only, no markdown:
{"segments":[{"text":"...","nodeIds":["id1"],"edgeIds":["sourceId|targetId|type"]},...]}

- "nodeIds" must only contain ids from the [Members] list.
- "edgeIds" must only contain keys from the [Edge IDs] list.
- Preserve each "text" exactly as given.`;
}

export function getAnnotateStorySegmentsUserPrompt(
  locale: Locale,
  params: {
    membersList: string;
    edgeIdsList: string;
    segmentsText: string;
  },
): string {
  const { membersList, edgeIdsList, segmentsText } = params;

  return `[Members]
${membersList}

[Edge IDs]
${edgeIdsList}

[Segments to annotate]
${segmentsText}

Output JSON with segments array (same order, same text, add nodeIds and edgeIds for each).`;
}

export function getAskCopilotSystemPrompt(
  locale: Locale,
  params: {
    stance: string;
    rules: string;
    graphMetadata: string;
    currentLayoutInstructionText: string;
  },
): string {
  const { stance, rules, graphMetadata, currentLayoutInstructionText } =
    params;

  const answerLanguage =
    locale === "en"
      ? "1. Answer the user's query in English. Be helpful and insightful."
      : "1. Answer the user's query in Japanese. Be helpful and insightful.";

  const nodeNameNote =
    locale === "en"
      ? "When the user mentions a node name, use the node name directly in the Layout Instruction JSON. The backend will automatically resolve node names to their IDs using fuzzy matching."
      : 'When the user mentions a node name (e.g., "ヨーゼフ・ボイス", "サイバネティクス"), you should use the node name directly in the Layout Instruction JSON. The backend will automatically resolve node names to their IDs using fuzzy matching. You do NOT need to look up node IDs manually.';

  return `You are "ArsTraverse Copilot", an AI assistant for curators.
Your goal is to help the user build, interpret, and visualize knowledge graphs.

[Curatorial Context]
${stance}
${rules}

[Current Graph Metadata]
${graphMetadata}
${currentLayoutInstructionText}
[Important Note about Node Names]
${nodeNameNote}

[Instructions]
${answerLanguage}
2. If the user asks to change the layout or visualization, you MUST generate a "Layout Instruction" JSON.
3. If you generate a Layout Instruction, output it at the very end of your response, enclosed in a code block.
4. For "x_axis" or "y_axis", use "timeline", "category_separation", or "linear".
5. When using "linear" type, x_axis controls horizontal direction, y_axis controls vertical direction.
6. Infer the correct property names from the [Current Graph Metadata] or common sense.
7. When the user mentions a node name, you can use the node name directly in the Layout Instruction JSON.
9. For centering nodes, use "center_nodes" instead of "focus_nodes".
10. For filtering nodes, add a "filter" field with nested conditions.`;
}

export function getAnalyzeGraphInsightsNoDataMessage(locale: Locale): string {
  return locale === "en"
    ? "No graph data was provided."
    : "グラフデータが提供されていません。";
}

export function getAnalyzeGraphInsightsSystemPrompt(
  locale: Locale,
  params: { stance: string; analysisData: string },
): string {
  const { stance, analysisData } = params;
  const outputLanguage =
    locale === "en"
      ? "- All text should be in English"
      : "- All text should be in Japanese";

  return `You are "ArsTraverse Insight Analyzer", an AI assistant specialized in analyzing knowledge graphs and providing insights for visualization.

[Curatorial Context]
${stance}

[Task]
Analyze the provided graph structure and generate a comprehensive summary that explains main themes, key characteristics, notable patterns, and visualization suggestions.

[Graph Analysis Data]
${analysisData}

[Output Format]
You MUST output a valid JSON object with summary, centralConcepts, filteringOptions, clusteringSuggestions, axisSuggestions, and layoutSuggestions.

[Important Guidelines]
${outputLanguage}
- Be specific and actionable in your suggestions`;
}

export function getAnalyzeGraphInsightsUserPrompt(locale: Locale): string {
  return locale === "en"
    ? "Analyze the characteristics of this graph and generate an easy-to-understand explanation."
    : "このグラフの特徴を分析して、わかりやすい説明を生成してください。";
}

export function getAnalyzeGraphInsightsFallbackSummary(
  locale: Locale,
  nodeCount: number,
  relationshipCount: number,
): string {
  return locale === "en"
    ? `This graph has ${nodeCount} nodes and ${relationshipCount} relationships. Detailed analysis could not be generated, but basic statistics are available.`
    : `このグラフには${nodeCount}個のノードと${relationshipCount}個のリレーションがあります。グラフの詳細な分析を生成できませんでしたが、基本的な統計情報は利用可能です。`;
}

export function getCentralNodeReason(
  locale: Locale,
  degree: number,
): string {
  return locale === "en"
    ? `This node has ${degree} relationships and plays a central role in the graph.`
    : `このノードは${degree}個のリレーションを持っており、グラフの中心的な役割を果たしています。`;
}

export function getCentralConceptsFallbackSummary(locale: Locale): string {
  return locale === "en"
    ? "High-degree nodes represent the central concepts of the graph."
    : "次数が高いノードがグラフの中心的な概念を表しています。";
}

export function getSummarizeCommunitiesSystemPrompt(
  locale: Locale,
  stance: string,
): string {
  const languageGuideline =
    locale === "en"
      ? "- Write all text in English unless the source data is mainly in another language."
      : "- Write all text in the SAME language as the source data (Members, labels).";

  return `You are "ArsTraverse Story Generator", an AI assistant specialized in analyzing knowledge graph communities and generating narrative summaries.

[Curatorial Context]
${stance}

[Task]
Generate a meaningful Title and Summary for each community, plus a Narrative Flow.

[Guidelines]
${languageGuideline}
- Select at most 10 communities for the narrative flow`;
}

export function getSummarizeCommunitiesUserPrompt(
  locale: Locale,
  communitiesText: string,
): string {
  return locale === "en"
    ? `Analyze the following communities and generate titles, summaries, and narrative flow:\n\n${communitiesText}`
    : `以下のコミュニティを分析して、タイトル、要約、ナラティブフローを生成してください:\n\n${communitiesText}`;
}

export function getMissingCommunityTitlesSystemPrompt(locale: Locale): string {
  return locale === "en"
    ? "You are a helpful assistant that generates meaningful titles for knowledge graph communities. Write each title in the SAME language as the Members and Labels."
    : "You are a helpful assistant that generates meaningful titles for knowledge graph communities. Write each title in the SAME language as the Members and Labels (e.g. Japanese if they are mainly in Japanese, English if mainly in English).";
}

export function getMissingCommunityTitlesUserPrompt(
  locale: Locale,
  communitiesText: string,
): string {
  if (locale === "en") {
    return `Generate a meaningful title for each of the following communities.\n\n${communitiesText}\n\nOutput JSON: {"titles":[{"communityId":"...","title":"..."}]}`;
  }

  return `以下のコミュニティに対して、それぞれ意味のあるタイトルを生成してください。タイトルはメンバー名・ラベルの言語に合わせてください。\n\n${communitiesText}\n\n出力形式（JSON）: {"titles":[{"communityId":"...","title":"..."}]}`;
}

export function getDefaultCommunityTitle(
  locale: Locale,
  communityId: string,
): string {
  return locale === "en"
    ? `Community ${communityId}`
    : `コミュニティ ${communityId}`;
}

export function getDefaultCommunitySummary(
  locale: Locale,
  memberCount: number,
): string {
  return locale === "en"
    ? `A community containing ${memberCount} nodes.`
    : `${memberCount}個のノードを含むコミュニティです。`;
}

export function getDefaultTransitionText(locale: Locale): string {
  return locale === "en"
    ? "Moving to the next community."
    : "次のコミュニティへ移ります。";
}

export function getRegenerateNarrativeFlowSystemPrompt(
  locale: Locale,
  stance: string,
): string {
  const languageRule =
    locale === "en"
      ? "- All text should be in English."
      : "- All text should be in Japanese.";

  return `You are "ArsTraverse Story Weaver", an AI assistant specialized in creating coherent narrative flows between knowledge graph communities.

[Curatorial Context]
${stance}

[Task]
Given an ORDERED sequence of communities, generate transition text connecting each community to the next.

[Guidelines]
${languageRule}`;
}

export function getRegenerateNarrativeFlowUserPrompt(
  locale: Locale,
  communitiesText: string,
): string {
  return locale === "en"
    ? `Generate transition text connecting the following communities in order:\n\n${communitiesText}`
    : `以下の順序でコミュニティをつなぐトランジションテキストを生成してください:\n\n${communitiesText}`;
}

export function getGenerateCommunityStorySystemPrompt(
  locale: Locale,
  params: {
    stance: string;
    narrativeContextBlock: string;
    hasDetailedInfo: boolean;
    hasEdgeInfo: boolean;
    wordCount: number;
  },
): string {
  const {
    stance,
    narrativeContextBlock,
    hasDetailedInfo,
    hasEdgeInfo,
    wordCount,
  } = params;

  if (hasDetailedInfo) {
    const edgeIdsInstruction = hasEdgeInfo
      ? '"edgeIds": array of edge composite keys from [Internal Relationships]'
      : '"edgeIds": always an empty array []';

    return `You are "ArsTraverse Story Writer".

[Curatorial Context]
${stance}
${narrativeContextBlock}

[Task]
Generate a rich narrative story (3-5 short paragraphs) about this community. For EACH paragraph output "text", "nodeIds", and ${edgeIdsInstruction}.

[Language]
- Write in the SAME language as the source data.

[Word Count]
- Total story: ${wordCount} words (±50).

[Output Format]
Valid JSON only: {"segments":[{"text":"...","nodeIds":[],"edgeIds":[]},...]}`;
  }

  return `You are "ArsTraverse Story Writer".

[Curatorial Context]
${stance}
${narrativeContextBlock}

[Task]
Generate a rich narrative story (3-5 paragraphs, ${wordCount} words ±50) about this community.

[Writing Style]
- Write in the SAME language as the source data.
- Use narrative style, not just listing facts.`;
}

export function getGenerateCommunityStoryUserPrompt(
  locale: Locale,
  params: { hasDetailedInfo: boolean; communityInfo: string; wordCount: number },
): string {
  const { hasDetailedInfo, communityInfo, wordCount } = params;

  if (hasDetailedInfo) {
    return locale === "en"
      ? `Generate a detailed story with node/edge IDs in JSON:\n\n${communityInfo}\n\nOutput valid JSON only.`
      : `以下のコミュニティについて、詳細なストーリーを短い段落に分け、各段落に対応するノードID・エッジIDを付けてJSONで出力してください:\n\n${communityInfo}`;
  }

  return locale === "en"
    ? `Generate a detailed story of about ${wordCount} words:\n\n${communityInfo}`
    : `以下のコミュニティについて、詳細なストーリーを${wordCount}字程度で生成してください:\n\n${communityInfo}`;
}

export function getSourceDocumentReferencesHeader(locale: Locale): string {
  return locale === "en"
    ? "\n\n[Source Document References]\nUse the following reference sections:\n\n"
    : "\n\n[Source Document References]\n以下の情報源から取得した関連セクションを参照して、より詳細で豊富なストーリーを生成してください:\n\n";
}

export function getWorkspaceBodyDocumentName(
  locale: Locale,
  workspaceName: string,
): string {
  return locale === "en"
    ? `${workspaceName} body text`
    : `${workspaceName}本文`;
}
