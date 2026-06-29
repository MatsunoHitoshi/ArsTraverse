import { protectedProcedure } from "../trpc";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import type { LayoutInstruction } from "@/app/const/types";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import {
  analyzeGraphStructure,
  prepareAnalysisForLLM,
} from "@/app/_utils/kg/graph-analysis";
import {
  AskCopilotInputSchema,
  AskCopilotOutputSchema,
  GraphDocumentFrontendSchema,
  CuratorialContextSchema,
  PreparedCommunitySchema,
} from "../schemas/knowledge-graph";
import { filterGraphByLayoutInstruction } from "../../utils/filter-graph-by-layout-instruction";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { getTextReference } from "./source-document";
import {
  toEdgeCompositeKey,
  type StorySegment,
} from "@/app/const/story-segment";
import {
  extractSectionsWithSegments,
  type SectionWithSegments,
} from "@/app/_utils/text/parse-content-sections";
import { getPlainTextFromTipTapContent } from "@/app/_utils/text/tiptap-content-to-plain-text";
import type { JSONContent } from "@tiptap/react";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import {
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
} from "@/app/_utils/kg/frontend-properties";
import { runExtractKGFromPlainText } from "./kg-extraction";
import {
  type CreateSourceDocumentWithGraphInput,
  runCreateSourceDocumentWithGraphData,
} from "./source-document";
import { runAttachDocuments, runDetachDocument } from "./topic-space";
import { classifyEdgeMotion as runClassifyEdgeMotion } from "@/server/services/kg/classify-edge-motion.service";
import type { Locale } from "i18n/routing";
import {
  getAnalyzeGraphInsightsFallbackSummary,
  getAnalyzeGraphInsightsNoDataMessage,
  getAnalyzeGraphInsightsSystemPrompt,
  getAnalyzeGraphInsightsUserPrompt,
  getAnnotateStorySegmentsSystemPrompt,
  getAnnotateStorySegmentsUserPrompt,
  getAskCopilotSystemPrompt,
  getCentralConceptsFallbackSummary,
  getCentralNodeReason,
  getDefaultCommunitySummary,
  getDefaultCommunityTitle,
  getDefaultTransitionText,
  getGenerateCommunityStorySystemPrompt,
  getGenerateCommunityStoryUserPrompt,
  getMissingCommunityTitlesSystemPrompt,
  getMissingCommunityTitlesUserPrompt,
  getRegenerateNarrativeFlowSystemPrompt,
  getRegenerateNarrativeFlowUserPrompt,
  getSourceDocumentReferencesHeader,
  getSummarizeCommunitiesSystemPrompt,
  getSummarizeCommunitiesUserPrompt,
  getWorkspaceBodyDocumentName,
} from "@/server/lib/i18n/prompts/kg-copilot";

// ---------------------------------------------------------------------------
// generateMetaGraphFromText 用ヘルパー関数
// ---------------------------------------------------------------------------

type GraphDoc = z.infer<typeof GraphDocumentFrontendSchema>;

/** セグメントごとにLLMで局所的なnodeIds/edgeIdsを推定する。annotateStorySegmentsおよびbuildMetaGraphFromTextSectionsで利用 */
async function runAnnotateStorySegments(
  communityId: string,
  segmentsToAnnotate: Array<{ text: string }>,
  memberNodes: Array<{
    id: string;
    name: string;
    label: string;
    properties?: Record<string, unknown>;
  }>,
  internalEdgesDetailed: Array<{
    sourceId: string;
    targetId: string;
    type: string;
  }>,
  locale: Locale = "ja",
): Promise<{ communityId: string; segments: StorySegment[] }> {
  const validNodeIds = new Set(memberNodes.map((n) => n.id));
  const validEdgeIds = new Set(
    internalEdgesDetailed.map((e) =>
      toEdgeCompositeKey(e.sourceId, e.targetId, e.type),
    ),
  );

  if (segmentsToAnnotate.length === 0) {
    return { communityId, segments: [] };
  }

  if (validNodeIds.size === 0) {
    return {
      communityId,
      segments: segmentsToAnnotate.map((s) => ({
        text: s.text,
        nodeIds: [],
        edgeIds: [],
        source: "auto_annotated" as const,
      })),
    };
  }

  const llm = new ChatOpenAI({
    temperature: 0.2,
    model: "gpt-4o-mini",
  });

  const edgeIdsList = internalEdgesDetailed
    .map((e) => toEdgeCompositeKey(e.sourceId, e.targetId, e.type))
    .join("\n");
  const membersList = memberNodes
    .map((n) => `id: "${n.id}" | ${n.name} (${n.label})`)
    .join("\n");
  const systemPrompt = getAnnotateStorySegmentsSystemPrompt(locale);

  const userPrompt = getAnnotateStorySegmentsUserPrompt(locale, {
    membersList,
    edgeIdsList,
    segmentsText: segmentsToAnnotate
      .map((s, i) => `${i + 1}. ${s.text}`)
      .join("\n\n"),
  });

  const response = await llm.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  let jsonText = (response.content as string).trim();
  if (jsonText.includes("```json")) {
    jsonText =
      jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
  } else if (jsonText.includes("```")) {
    jsonText = jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      segments?: Array<{
        text?: string;
        nodeIds?: string[];
        edgeIds?: string[];
      }>;
    };
    const raw = Array.isArray(parsed.segments) ? parsed.segments : [];
    const segments: StorySegment[] = segmentsToAnnotate.map((inputSeg, idx) => {
      const r = raw[idx];
      const text = inputSeg.text;
      if (!r) {
        return {
          text,
          nodeIds: [],
          edgeIds: [],
          source: "auto_annotated" as const,
        };
      }
      return {
        text,
        nodeIds: Array.isArray(r.nodeIds)
          ? r.nodeIds.filter((id) => validNodeIds.has(id))
          : [],
        edgeIds: Array.isArray(r.edgeIds)
          ? r.edgeIds.filter((id) => validEdgeIds.has(id))
          : [],
        source: "auto_annotated" as const,
      };
    });
    return { communityId, segments };
  } catch (e) {
    console.warn("runAnnotateStorySegments: JSON parse failed", e);
    return {
      communityId,
      segments: segmentsToAnnotate.map((s) => ({
        text: s.text,
        nodeIds: [],
        edgeIds: [],
        source: "auto_annotated" as const,
      })),
    };
  }
}

/**
 * ワークスペース本文からKGを抽出し、TopicSpaceに統合する。
 * 統合後のグラフを返す。失敗時はエラーをスローする（ユーザーへ伝播）。
 */
async function integrateWorkspaceTextGraph(
  ctx: Parameters<typeof runAttachDocuments>[0],
  workspaceId: string,
  contentArray: JSONContent[],
  inputGraphDocument: GraphDoc,
  locale: Locale = "ja",
): Promise<GraphDoc> {
  if (contentArray.length === 0) return inputGraphDocument;

  const workspace = await ctx.db.workspace.findFirst({
    where: {
      id: workspaceId,
      isDeleted: false,
      OR: [
        { userId: ctx.session.user.id },
        { collaborators: { some: { id: ctx.session.user.id } } },
      ],
    },
    include: {
      referencedTopicSpaces: {
        where: { isDeleted: false },
        include: {
          sourceDocuments: { where: { isDeleted: false } },
        },
      },
    },
  });

  const plainText = getPlainTextFromTipTapContent(contentArray);
  if (
    !plainText.trim() ||
    !workspace?.name ||
    workspace.referencedTopicSpaces.length === 0
  ) {
    return inputGraphDocument;
  }

  const textBlob = new Blob([plainText], {
    type: "text/plain; charset=utf-8",
  });
  const fileUrl = await storageUtils.uploadFromBlob(
    textBlob,
    BUCKETS.PATH_TO_INPUT_TXT,
  );
  if (!fileUrl) return inputGraphDocument;

  const extractedGraph = await runExtractKGFromPlainText(plainText);
  const hasGraph =
    extractedGraph &&
    (extractedGraph.nodes.length > 0 ||
      extractedGraph.relationships.length > 0);
  if (!hasGraph || !extractedGraph) return inputGraphDocument;

  const topicSpace = workspace.referencedTopicSpaces[0]!;
  const bodyDocName = getWorkspaceBodyDocumentName(locale, workspace.name);
  const existingBodyDoc = topicSpace.sourceDocuments.find(
    (d) => d.name === bodyDocName,
  );
  if (existingBodyDoc) {
    await runDetachDocument(ctx, {
      id: topicSpace.id,
      documentId: existingBodyDoc.id,
    });
  }
  const created = await runCreateSourceDocumentWithGraphData(ctx, {
    name: bodyDocName,
    url: fileUrl,
    dataJson: {
      nodes: extractedGraph.nodes,
      relationships: extractedGraph.relationships,
    } as CreateSourceDocumentWithGraphInput["dataJson"],
  });
  await runAttachDocuments(ctx, {
    id: topicSpace.id,
    documentIds: [created.sourceDocument.id],
  });
  const topicSpaceWithGraph = await ctx.db.topicSpace.findFirst({
    where: { id: topicSpace.id, isDeleted: false },
    include: { graphNodes: true, graphRelationships: true },
  });
  if (!topicSpaceWithGraph) return inputGraphDocument;

  return {
    nodes: topicSpaceWithGraph.graphNodes.map((n) =>
      formNodeDataForFrontend(n),
    ),
    relationships: topicSpaceWithGraph.graphRelationships.map((r) =>
      formRelationshipDataForFrontend(r),
    ),
  } as GraphDoc;
}

interface CommunityAssignmentResult {
  nodeToCommunity: Map<string, string>;
  communityGroups: Map<string, string[]>;
  communityInternalEdges: Map<
    string,
    Array<{ sourceName: string; targetName: string; type: string }>
  >;
  communityExternalConnections: Map<
    string,
    Map<string, { count: number; types: Set<string> }>
  >;
}

/**
 * Louvainコミュニティをテキストセクションに割り当てる。
 */
function assignCommunitiesToSections(
  graphDocument: GraphDoc,
  sections: SectionWithSegments[],
): CommunityAssignmentResult {
  const nameToNode = new Map(graphDocument.nodes.map((n) => [n.name, n]));
  const communityIdBySectionIndex = (i: number) => `text-${i}` as const;

  const sectionSeedIds = sections.map(() => new Set<string>());
  for (const section of sections) {
    const seedSet = sectionSeedIds[section.sectionIndex]!;
    for (const name of section.entityNames) {
      const node = nameToNode.get(name);
      if (node) seedSet.add(node.id);
    }
  }

  const fullGraph = new Graph();
  graphDocument.nodes.forEach((node) => {
    fullGraph.addNode(node.id, {
      name: node.name,
      label: node.label,
      properties: node.properties ?? {},
    });
  });
  graphDocument.relationships.forEach((rel) => {
    if (!fullGraph.hasEdge(rel.sourceId, rel.targetId)) {
      fullGraph.addEdge(rel.sourceId, rel.targetId, {
        type: rel.type,
        properties: rel.properties ?? {},
        weight: 1,
      });
    }
  });
  const louvainLabels = louvain(fullGraph) as Record<string, number>;

  const numericToNodeIds = new Map<number, string[]>();
  graphDocument.nodes.forEach((node) => {
    const num = louvainLabels[node.id];
    if (num === undefined) return;
    if (!numericToNodeIds.has(num)) numericToNodeIds.set(num, []);
    numericToNodeIds.get(num)!.push(node.id);
  });

  const numericToSectionOrNonStory = new Map<number, string>();
  const nonStoryNumericLabels: number[] = [];
  for (const [num, nodeIds] of numericToNodeIds) {
    let bestSectionIndex: number | null = null;
    let bestCount = 0;
    for (let i = 0; i < sections.length; i++) {
      const seedSet = sectionSeedIds[i]!;
      const count = nodeIds.filter((id) => seedSet.has(id)).length;
      if (count > bestCount) {
        bestCount = count;
        bestSectionIndex = i;
      }
    }
    if (bestSectionIndex !== null && bestCount > 0) {
      numericToSectionOrNonStory.set(
        num,
        communityIdBySectionIndex(bestSectionIndex),
      );
    } else {
      nonStoryNumericLabels.push(num);
    }
  }
  nonStoryNumericLabels.sort((a, b) => a - b);
  nonStoryNumericLabels.forEach((num, idx) => {
    numericToSectionOrNonStory.set(num, `louvain-${idx}`);
  });

  const nodeToCommunity = new Map<string, string>();
  graphDocument.nodes.forEach((node) => {
    const num = louvainLabels[node.id];
    const cid =
      num !== undefined
        ? (numericToSectionOrNonStory.get(num) ?? "louvain-0")
        : "louvain-0";
    nodeToCommunity.set(node.id, cid);
  });

  const communityGroups = new Map<string, string[]>();
  for (const [nodeId, cid] of nodeToCommunity) {
    if (!communityGroups.has(cid)) communityGroups.set(cid, []);
    communityGroups.get(cid)!.push(nodeId);
  }

  const communityInternalEdges = new Map<
    string,
    Array<{ sourceName: string; targetName: string; type: string }>
  >();
  const communityExternalConnections = new Map<
    string,
    Map<string, { count: number; types: Set<string> }>
  >();

  graphDocument.relationships.forEach((rel) => {
    const sourceCommunity = nodeToCommunity.get(rel.sourceId) ?? "unassigned";
    const targetCommunity = nodeToCommunity.get(rel.targetId) ?? "unassigned";
    const sourceNode = graphDocument.nodes.find((n) => n.id === rel.sourceId);
    const targetNode = graphDocument.nodes.find((n) => n.id === rel.targetId);
    if (!sourceNode || !targetNode) return;
    if (sourceCommunity === targetCommunity) {
      const list = communityInternalEdges.get(sourceCommunity) ?? [];
      list.push({
        sourceName: sourceNode.name,
        targetName: targetNode.name,
        type: rel.type,
      });
      communityInternalEdges.set(sourceCommunity, list);
    } else {
      let conn = communityExternalConnections.get(sourceCommunity);
      if (!conn) {
        conn = new Map();
        communityExternalConnections.set(sourceCommunity, conn);
      }
      const existing = conn.get(targetCommunity) ?? {
        count: 0,
        types: new Set<string>(),
      };
      existing.count += 1;
      existing.types.add(rel.type);
      conn.set(targetCommunity, existing);
    }
  });

  return {
    nodeToCommunity,
    communityGroups,
    communityInternalEdges,
    communityExternalConnections,
  };
}

/**
 * コミュニティ割り当てからメタグラフ出力を構築する。
 */
async function buildMetaGraphFromTextSections(
  graphDocument: GraphDoc,
  communityData: CommunityAssignmentResult,
  sections: SectionWithSegments[],
  minCommunitySize: number,
  locale: Locale = "ja",
): Promise<{
  metaNodes: Array<{
    communityId: string;
    memberNodeIds: string[];
    memberNodeNames: string[];
    size: number;
    internalEdges: Array<{
      sourceName: string;
      targetName: string;
      type: string;
    }>;
    externalConnections: Array<{
      targetCommunityId: string;
      edgeCount: number;
      edgeTypes: string[];
    }>;
    hasExternalConnections: boolean;
  }>;
  metaGraph: GraphDocumentForFrontend;
  communityMap: Record<string, string>;
  preparedCommunities: z.infer<typeof PreparedCommunitySchema>[];
  narrativeFlow: Array<{
    communityId: string;
    order: number;
    transitionText: string;
  }>;
  summaries: Array<{ communityId: string; title: string; summary: string }>;
  detailedStories: Record<string, string | JSONContent>;
}> {
  const {
    nodeToCommunity,
    communityGroups,
    communityInternalEdges,
    communityExternalConnections,
  } = communityData;

  const filteredMetaNodes = Array.from(communityGroups.entries())
    .map(([communityId, memberNodeIds]) => {
      const memberNodes = memberNodeIds
        .map((id) => graphDocument.nodes.find((n) => n.id === id))
        .filter((n): n is (typeof graphDocument.nodes)[0] => n !== undefined);
      const externalConnMap = communityExternalConnections.get(communityId);
      const externalConnections = externalConnMap
        ? Array.from(externalConnMap.entries()).map(([targetCommId, data]) => ({
            targetCommunityId: targetCommId,
            edgeCount: data.count,
            edgeTypes: Array.from(data.types),
          }))
        : [];
      return {
        communityId,
        memberNodeIds,
        memberNodeNames: memberNodes.map((n) => n.name),
        size: memberNodeIds.length,
        internalEdges:
          communityInternalEdges.get(communityId)?.slice(0, 20) ?? [],
        externalConnections,
        hasExternalConnections: externalConnections.length > 0,
      };
    })
    .filter((metaNode) => {
      if (metaNode.hasExternalConnections) return true;
      return metaNode.size >= minCommunitySize;
    });

  const metaEdgesMap = new Map<string, { count: number; types: Set<string> }>();
  graphDocument.relationships.forEach((rel) => {
    const sourceCommunity = nodeToCommunity.get(rel.sourceId);
    const targetCommunity = nodeToCommunity.get(rel.targetId);
    if (
      sourceCommunity &&
      targetCommunity &&
      sourceCommunity !== targetCommunity
    ) {
      const edgeKey =
        sourceCommunity < targetCommunity
          ? `${sourceCommunity}-${targetCommunity}`
          : `${targetCommunity}-${sourceCommunity}`;
      const existing = metaEdgesMap.get(edgeKey) ?? {
        count: 0,
        types: new Set<string>(),
      };
      existing.count += 1;
      existing.types.add(rel.type);
      metaEdgesMap.set(edgeKey, existing);
    }
  });

  const validCommunityIds = new Set(
    filteredMetaNodes.map((n) => n.communityId),
  );
  const metaGraphNodes = filteredMetaNodes.map((metaNode) => ({
    id: metaNode.communityId,
    name: metaNode.communityId.startsWith("text-")
      ? (sections[Number(metaNode.communityId.replace("text-", ""))]?.title ??
        metaNode.communityId)
      : `Community ${metaNode.communityId}`,
    label: "Community",
    properties: {
      size: String(metaNode.size),
      memberCount: String(metaNode.size),
      memberNames: metaNode.memberNodeNames.slice(0, 10).join(", "),
    },
    topicSpaceId: undefined,
    documentGraphId: undefined,
    neighborLinkCount: metaNode.externalConnections.length,
    visible: true,
  }));

  // h2 で区切られたセクションのうち、フィルタで除外されたものを metaGraph に追加（保存時に MetaGraphNode が必要）
  for (const section of sections) {
    const cid = `text-${section.sectionIndex}`;
    if (validCommunityIds.has(cid)) continue;
    metaGraphNodes.push({
      id: cid,
      name: section.title,
      label: "Community",
      properties: {
        size: "0",
        memberCount: "0",
        memberNames: "",
      },
      topicSpaceId: undefined,
      documentGraphId: undefined,
      neighborLinkCount: 0,
      visible: true,
    });
  }
  const metaGraphRelationships = Array.from(metaEdgesMap.entries())
    .filter(([edgeKey]) => {
      const [a, b] = edgeKey.split("-");
      return validCommunityIds.has(a ?? "") && validCommunityIds.has(b ?? "");
    })
    .map(([edgeKey, edgeData], index) => {
      const [sourceCommunity, targetCommunity] = edgeKey.split("-");
      return {
        id: `meta-edge-${index}`,
        type: Array.from(edgeData.types).join(", "),
        properties: {
          weight: String(edgeData.count),
          edgeCount: String(edgeData.count),
        },
        sourceId: sourceCommunity ?? "",
        targetId: targetCommunity ?? "",
        topicSpaceId: undefined,
        documentGraphId: undefined,
      };
    });

  const metaGraph: GraphDocumentForFrontend = {
    nodes: metaGraphNodes,
    relationships: metaGraphRelationships,
  };

  const communityMap: Record<string, string> = {};
  graphDocument.nodes.forEach((n) => {
    communityMap[n.id] = nodeToCommunity.get(n.id) ?? "unassigned";
  });

  const preparedCommunities = filteredMetaNodes.map((metaNode) => {
    const memberNodes = metaNode.memberNodeIds
      .map((id) => graphDocument.nodes.find((n) => n.id === id))
      .filter((n): n is (typeof graphDocument.nodes)[0] => n !== undefined);
    const internalEdges =
      communityInternalEdges.get(metaNode.communityId) ?? [];
    const allInternalEdges = internalEdges.map((edge) => {
      const sourceNode = graphDocument.nodes.find(
        (n) => n.name === edge.sourceName,
      );
      const targetNode = graphDocument.nodes.find(
        (n) => n.name === edge.targetName,
      );
      const rel =
        sourceNode && targetNode
          ? graphDocument.relationships.find(
              (r) =>
                r.sourceId === sourceNode.id &&
                r.targetId === targetNode.id &&
                r.type === edge.type,
            )
          : undefined;
      return {
        sourceId: sourceNode?.id ?? "",
        sourceName: edge.sourceName,
        targetId: targetNode?.id ?? "",
        targetName: edge.targetName,
        type: edge.type,
        properties: rel?.properties ?? {},
      };
    });
    const externalConnMap = communityExternalConnections.get(
      metaNode.communityId,
    );
    const externalConnectionsText = externalConnMap
      ? Array.from(externalConnMap.entries())
          .map(
            ([targetCommId, data]) =>
              `Community ${targetCommId} (${data.count} edges: ${Array.from(data.types).join(", ")})`,
          )
          .join(", ")
      : "";
    const internalEdgesText = internalEdges
      .slice(0, 10)
      .map((e) => `${e.sourceName} --[${e.type}]--> ${e.targetName}`)
      .join(", ");
    return {
      communityId: metaNode.communityId,
      memberNodeNames: metaNode.memberNodeNames,
      memberNodeLabels: memberNodes.map((n) => n.label),
      internalEdges: internalEdgesText || undefined,
      externalConnections: externalConnectionsText || undefined,
      memberNodes: memberNodes.map((n) => ({
        id: n.id,
        name: n.name,
        label: n.label,
        properties: n.properties ?? {},
      })),
      internalEdgesDetailed: allInternalEdges,
    };
  });

  // h2 で区切られたセクションのうち、フィルタで除外されたもの用のプレースホルダを追加
  const existingCids = new Set(preparedCommunities.map((p) => p.communityId));
  for (const section of sections) {
    const cid = `text-${section.sectionIndex}`;
    if (existingCids.has(cid)) continue;
    preparedCommunities.push({
      communityId: cid,
      memberNodeNames: [],
      memberNodeLabels: [],
      internalEdges: undefined,
      externalConnections: undefined,
      memberNodes: [],
      internalEdgesDetailed: [],
    });
  }

  // h2 で区切られたセクションはすべて narrativeFlow に含める（Louvain/ノード数に依存しない）
  const narrativeFlow = sections.map((section, idx) => ({
    communityId: `text-${section.sectionIndex}` as const,
    order: idx + 1,
    transitionText: "",
  }));

  // h2 で区切られたセクションはすべて summaries に含める
  const summaries = sections.map((section) => {
    const cid = `text-${section.sectionIndex}`;
    return {
      communityId: cid,
      title: section.title,
      summary: section.segments[0]?.text?.slice(0, 200) ?? "",
    };
  });

  // セグメントの対応付け: kg.annotateStorySegments と同様に LLM で局所的な nodeIds/edgeIds を推定
  const preparedByCid = new Map(
    preparedCommunities.map((p) => [p.communityId, p]),
  );
  // h2 で区切られたセクションはすべて detailedStories に含める
  const detailedStories: Record<string, string | JSONContent> = {};
  const sectionPromises = sections.map(async (section) => {
    const cid = `text-${section.sectionIndex}` as const;
    const prepared = preparedByCid.get(cid);
    const memberNodes = prepared?.memberNodes ?? [];
    const internalEdgesDetailed = prepared?.internalEdgesDetailed ?? [];
    const result = await runAnnotateStorySegments(
      cid,
      section.segments.map((s) => ({ text: s.text })),
      memberNodes,
      internalEdgesDetailed,
      locale,
    );
    return { cid, segments: result.segments };
  });
  const annotationResults = await Promise.all(sectionPromises);
  for (const { cid, segments } of annotationResults) {
    if (segments) {
      const segmentDocs = segments.map((seg) => ({
        type: "paragraph" as const,
        attrs: {
          ...(seg.nodeIds?.length ? { segmentNodeIds: seg.nodeIds } : {}),
          ...(seg.edgeIds?.length ? { segmentEdgeIds: seg.edgeIds } : {}),
          ...(seg.source ? { segmentSource: seg.source } : {}),
        },
        content: [{ type: "text" as const, text: seg.text }],
      }));
      detailedStories[cid] = { type: "doc", content: segmentDocs };
    }
  }

  // 保存時に MetaGraphNode が必要なため、フィルタで除外されたセクションも metaNodes に含める
  const allMetaNodes = [...filteredMetaNodes];
  for (const section of sections) {
    const cid = `text-${section.sectionIndex}`;
    if (filteredMetaNodes.some((n) => n.communityId === cid)) continue;
    allMetaNodes.push({
      communityId: cid,
      memberNodeIds: [],
      memberNodeNames: [],
      size: 0,
      internalEdges: [],
      externalConnections: [],
      hasExternalConnections: false,
    });
  }

  return {
    metaNodes: allMetaNodes,
    metaGraph,
    communityMap,
    preparedCommunities,
    narrativeFlow,
    summaries,
    detailedStories,
  };
}

// ---------------------------------------------------------------------------

export const copilotProcedures = {
  askCopilot: protectedProcedure
    .input(AskCopilotInputSchema)
    .output(AskCopilotOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        query,
        currentGraphData,
        curatorialContext,
        currentLayoutInstruction,
      } = input;

      // ノード名からノードを検索するヘルパー関数
      const findNodeByName = (
        searchName: string,
        nodes: z.infer<typeof GraphDocumentFrontendSchema>["nodes"] | undefined,
      ) => {
        if (!nodes) return undefined;
        const lowerSearchName = searchName.toLowerCase().trim();

        // 1. 完全一致
        let matched = nodes.find(
          (node) => node.name.toLowerCase() === lowerSearchName,
        );
        if (matched) return matched;

        // 2. 部分一致（検索名がノード名に含まれる、またはその逆）
        matched = nodes.find(
          (node) =>
            node.name.toLowerCase().includes(lowerSearchName) ||
            lowerSearchName.includes(node.name.toLowerCase()),
        );
        if (matched) return matched;

        // 3. 類似度マッチング（「ヨーゼフ・ボイス」と「ヨハンナ・マリア・マルグレート・ボイス」のような場合）
        // キーワードで検索（より柔軟なマッチング）
        const keywords = lowerSearchName
          .split(/[\s・\-]/)
          .filter((k) => k.length > 1);
        if (keywords.length > 0) {
          // 最も多くのキーワードに一致するノードを探す
          let bestMatch: (typeof nodes)[number] | undefined;
          let bestScore = 0;
          nodes.forEach((node) => {
            const nodeNameLower = node.name.toLowerCase();
            const score = keywords.filter((keyword) =>
              nodeNameLower.includes(keyword),
            ).length;
            // すべてのキーワードが一致する場合を優先
            if (score === keywords.length && score > bestScore) {
              bestScore = score;
              bestMatch = node;
            }
            // すべてのキーワードが一致しない場合でも、最も多くのキーワードが一致するノードを記録
            else if (score > bestScore && bestScore < keywords.length) {
              bestScore = score;
              bestMatch = node;
            }
          });
          // 少なくとも1つのキーワードが一致し、かつ最もスコアが高い場合は返す
          if (bestMatch && bestScore > 0) {
            // 特に「ボイス」のような重要なキーワードが含まれている場合は優先
            const hasImportantKeyword = keywords.some((keyword) => {
              const keywordLength = keyword.length;
              // 3文字以上のキーワード、または「ボイス」のような固有名詞の一部
              return (
                keywordLength >= 3 &&
                bestMatch!.name.toLowerCase().includes(keyword)
              );
            });
            if (hasImportantKeyword || bestScore >= keywords.length * 0.5) {
              return bestMatch;
            }
          }
        }

        return undefined;
      };

      const llm = new ChatOpenAI({
        temperature: 0.3,
        model: "gpt-4o-mini", // より賢いモデルを使用
      });

      // グラフのメタデータを抽出
      let graphMetadata = "Graph data is not available.";
      if (currentGraphData?.nodes) {
        const nodes = currentGraphData.nodes;
        const nodeCount = nodes.length;
        // 最初の5つのノードのプロパティキーを収集して、利用可能な属性を推測
        const attributeKeys = new Set<string>();
        nodes.slice(0, 10).forEach((node) => {
          if (node.properties) {
            Object.keys(node.properties).forEach((key) =>
              attributeKeys.add(key),
            );
          }
        });
        graphMetadata = `Nodes: ${nodeCount}, Attributes: ${Array.from(
          attributeKeys,
        ).join(", ")}`;
      }

      // キュレトリアルコンテキストの整理
      const stance = curatorialContext?.stance
        ? `Stance: ${curatorialContext.stance}`
        : "Stance: Neutral/Undefined";
      const rules = curatorialContext?.extractionRules
        ? `Extraction Rules: ${JSON.stringify(curatorialContext.extractionRules)}`
        : "";

      // 現在のレイアウト指示を文字列化
      const currentLayoutInstructionText = currentLayoutInstruction
        ? `\n[Current Layout Instruction]\n${JSON.stringify(currentLayoutInstruction, null, 2)}\n\n**IMPORTANT**: When generating a new Layout Instruction, you MUST preserve all existing settings from the Current Layout Instruction that are not explicitly mentioned in the user's request. Merge the new settings with the existing ones. For example, if the current instruction has "x_axis" with "strength": 0.8 and the user only asks to change "y_axis", keep the "x_axis" settings unchanged.`
        : "";

      const systemPrompt = getAskCopilotSystemPrompt(ctx.locale, {
        stance,
        rules,
        graphMetadata,
        currentLayoutInstructionText,
      });

      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ]);

      const responseText = response.content as string;

      // JSONブロックを抽出
      let layoutInstruction: LayoutInstruction | null = null;
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch?.[1]) {
        try {
          const newLayoutInstruction = JSON.parse(
            jsonMatch[1],
          ) as LayoutInstruction;

          // 既存のレイアウト指示とマージ（深いマージ）
          if (currentLayoutInstruction) {
            layoutInstruction = {
              ...currentLayoutInstruction,
              ...newLayoutInstruction,
              forces: {
                ...currentLayoutInstruction.forces,
                ...newLayoutInstruction.forces,
                // 各force設定も個別にマージ
                x_axis: newLayoutInstruction.forces?.x_axis
                  ? {
                      ...currentLayoutInstruction.forces?.x_axis,
                      ...newLayoutInstruction.forces.x_axis,
                    }
                  : currentLayoutInstruction.forces?.x_axis,
                y_axis: newLayoutInstruction.forces?.y_axis
                  ? {
                      ...currentLayoutInstruction.forces?.y_axis,
                      ...newLayoutInstruction.forces.y_axis,
                    }
                  : currentLayoutInstruction.forces?.y_axis,
                charge: newLayoutInstruction.forces?.charge
                  ? {
                      ...currentLayoutInstruction.forces?.charge,
                      ...newLayoutInstruction.forces.charge,
                    }
                  : currentLayoutInstruction.forces?.charge,
                focus_nodes: newLayoutInstruction.forces?.focus_nodes
                  ? newLayoutInstruction.forces.focus_nodes
                  : currentLayoutInstruction.forces?.focus_nodes,
                highlight_nodes: newLayoutInstruction.forces?.highlight_nodes
                  ? newLayoutInstruction.forces.highlight_nodes
                  : currentLayoutInstruction.forces?.highlight_nodes,
                center_nodes: newLayoutInstruction.forces?.center_nodes
                  ? newLayoutInstruction.forces.center_nodes
                  : currentLayoutInstruction.forces?.center_nodes,
              },
              filter: newLayoutInstruction.filter
                ? {
                    ...currentLayoutInstruction.filter,
                    ...newLayoutInstruction.filter,
                    // conditionもマージ（新しいものを優先）
                    condition: newLayoutInstruction.filter.condition
                      ? newLayoutInstruction.filter.condition
                      : currentLayoutInstruction.filter?.condition,
                  }
                : currentLayoutInstruction.filter,
            };
          } else {
            layoutInstruction = newLayoutInstruction;
          }

          // ノード名からIDを解決する処理（focus_nodes用）
          if (
            layoutInstruction?.forces?.focus_nodes?.targetNodeIds &&
            currentGraphData?.nodes
          ) {
            const resolvedNodeIds =
              layoutInstruction.forces.focus_nodes.targetNodeIds.map(
                (nodeIdOrName) => {
                  // 既にID形式（短いID形式）の場合はそのまま使用
                  if (nodeIdOrName.match(/^[a-z0-9]{20,}$/i)) {
                    const existingNode = currentGraphData.nodes.find(
                      (n) => n.id === nodeIdOrName,
                    );
                    if (existingNode) return nodeIdOrName;
                  }
                  // ノード名として検索（部分一致、類似度マッチング）
                  const matchedNode = findNodeByName(
                    nodeIdOrName,
                    currentGraphData.nodes,
                  );
                  return matchedNode?.id ?? nodeIdOrName;
                },
              );
            layoutInstruction.forces.focus_nodes.targetNodeIds =
              resolvedNodeIds;
          }

          // ノード名からIDを解決する処理（center_nodes用）
          if (
            layoutInstruction?.forces?.center_nodes?.targetNodeIds &&
            currentGraphData?.nodes
          ) {
            const resolvedNodeIds =
              layoutInstruction.forces.center_nodes.targetNodeIds.map(
                (nodeIdOrName) => {
                  // 既にID形式（短いID形式）の場合はそのまま使用
                  if (nodeIdOrName.match(/^[a-z0-9]{20,}$/i)) {
                    const existingNode = currentGraphData.nodes.find(
                      (n) => n.id === nodeIdOrName,
                    );
                    if (existingNode) return nodeIdOrName;
                  }
                  // ノード名として検索（部分一致、類似度マッチング）
                  const matchedNode = findNodeByName(
                    nodeIdOrName,
                    currentGraphData.nodes,
                  );
                  return matchedNode?.id ?? nodeIdOrName;
                },
              );
            layoutInstruction.forces.center_nodes.targetNodeIds =
              resolvedNodeIds;
          }

          // ノード名からIDを解決する処理（highlight_nodes用）
          if (
            layoutInstruction?.forces?.highlight_nodes?.targetNodeIds &&
            currentGraphData?.nodes
          ) {
            const resolvedNodeIds =
              layoutInstruction.forces.highlight_nodes.targetNodeIds.map(
                (nodeIdOrName) => {
                  // 既にID形式（短いID形式）の場合はそのまま使用
                  if (nodeIdOrName.match(/^[a-z0-9]{20,}$/i)) {
                    const existingNode = currentGraphData.nodes.find(
                      (n) => n.id === nodeIdOrName,
                    );
                    if (existingNode) return nodeIdOrName;
                  }
                  // ノード名として検索（部分一致、類似度マッチング）
                  const matchedNode = findNodeByName(
                    nodeIdOrName,
                    currentGraphData.nodes,
                  );
                  return matchedNode?.id ?? nodeIdOrName;
                },
              );
            layoutInstruction.forces.highlight_nodes.targetNodeIds =
              resolvedNodeIds;
          }

          // filter.centerNodeIdsのノード名解決
          if (
            layoutInstruction?.filter?.centerNodeIds &&
            currentGraphData?.nodes
          ) {
            const resolvedNodeIds = layoutInstruction.filter.centerNodeIds.map(
              (nodeIdOrName) => {
                // 既にID形式（短いID形式）の場合はそのまま使用
                if (nodeIdOrName.match(/^[a-z0-9]{20,}$/i)) {
                  const existingNode = currentGraphData.nodes.find(
                    (n) => n.id === nodeIdOrName,
                  );
                  if (existingNode) return nodeIdOrName;
                }
                // ノード名として検索（部分一致、類似度マッチング）
                const matchedNode = findNodeByName(
                  nodeIdOrName,
                  currentGraphData.nodes,
                );
                return matchedNode?.id ?? nodeIdOrName;
              },
            );
            layoutInstruction.filter.centerNodeIds = resolvedNodeIds;
          }
        } catch (e) {
          console.error("Failed to parse layout instruction JSON", e);
        }
      }

      const replyText = responseText.replace(/```json[\s\S]*?```/, "").trim();

      // フィルタリング済みグラフを生成
      let filteredGraphData: GraphDocumentForFrontend | undefined = undefined;
      if (layoutInstruction?.filter && currentGraphData) {
        try {
          // GraphDocumentFrontendSchemaの型とGraphDocumentForFrontendの型が
          // propertiesの型で異なるが、実際のデータは互換性があるため型アサーションを使用
          // propertiesは実行時に文字列として扱われるため、型の不一致は問題ない
          filteredGraphData = filterGraphByLayoutInstruction(
            currentGraphData as GraphDocumentForFrontend,
            layoutInstruction.filter,
          );
        } catch (e) {
          console.error("Failed to filter graph", e);
          // エラーが発生した場合はフィルタリングをスキップ
        }
      }

      return {
        reply: replyText,
        rawResponse: responseText,
        layoutInstruction,
        filteredGraphData,
      };
    }),

  analyzeGraphInsights: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        currentGraphData: GraphDocumentFrontendSchema.optional(),
        curatorialContext: CuratorialContextSchema.optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { currentGraphData, curatorialContext } = input;

      if (!currentGraphData?.nodes || currentGraphData.nodes.length === 0) {
        return {
          insights: {
            summary: getAnalyzeGraphInsightsNoDataMessage(ctx.locale),
            centralConcepts: {
              nodes: [],
              summary: "",
            },
            filteringOptions: [],
            clusteringSuggestions: [],
            axisSuggestions: {
              x_axis: [],
              y_axis: [],
            },
            layoutSuggestions: [],
          },
        };
      }

      // グラフ構造分析を実行
      const analysis = analyzeGraphStructure(
        currentGraphData as GraphDocumentForFrontend,
      );

      // LLMに渡すための構造化データを準備
      const analysisData = prepareAnalysisForLLM(analysis);

      const llm = new ChatOpenAI({
        temperature: 0.3,
        model: "gpt-4o-mini",
      });

      const stance = curatorialContext?.stance
        ? `Stance: ${curatorialContext.stance}`
        : "Stance: Neutral/Undefined";

      const systemPrompt = getAnalyzeGraphInsightsSystemPrompt(ctx.locale, {
        stance,
        analysisData,
      });

      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: getAnalyzeGraphInsightsUserPrompt(ctx.locale),
        },
      ]);

      const responseText = response.content as string;

      // JSONを抽出
      let jsonText = responseText.trim();
      if (jsonText.includes("```json")) {
        jsonText =
          jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
      } else if (jsonText.includes("```")) {
        jsonText =
          jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
      }

      try {
        const insights = JSON.parse(jsonText) as {
          summary: string;
          centralConcepts: {
            nodes: Array<{
              id: string;
              name: string;
              label: string;
              centralityScore: number;
              degree: number;
              reason: string;
            }>;
            summary: string;
          };
          filteringOptions: Array<{
            type: string;
            description: string;
            suggestedValues: string[];
            reasoning: string;
          }>;
          clusteringSuggestions: Array<{
            method: string;
            description: string;
            expectedClusters: number;
            reasoning: string;
          }>;
          axisSuggestions: {
            x_axis: Array<{
              attribute: string;
              type: string;
              reasoning: string;
              groups?: Record<string, string | number> | null;
            }>;
            y_axis: Array<{
              attribute: string;
              type: string;
              reasoning: string;
              groups?: Record<string, string | number> | null;
            }>;
          };
          layoutSuggestions: Array<{
            name: string;
            description: string;
            layoutInstruction: LayoutInstruction;
            reasoning: string;
          }>;
        };

        return {
          insights: {
            summary: insights.summary,
            centralConcepts: insights.centralConcepts,
            filteringOptions: insights.filteringOptions ?? [],
            clusteringSuggestions: insights.clusteringSuggestions ?? [],
            axisSuggestions: insights.axisSuggestions ?? {
              x_axis: [],
              y_axis: [],
            },
            layoutSuggestions: insights.layoutSuggestions ?? [],
          },
        };
      } catch (error) {
        console.error("Failed to parse insights JSON", error);
        // フォールバック: シンプルなサマリーを返す
        return {
          insights: {
            summary: getAnalyzeGraphInsightsFallbackSummary(
              ctx.locale,
              analysis.structure.nodeCount,
              analysis.structure.relationshipCount,
            ),
            centralConcepts: {
              nodes: analysis.structure.topDegreeNodes.slice(0, 5).map((n) => ({
                id: n.id,
                name: n.name,
                label: n.label,
                centralityScore: n.degree / analysis.structure.nodeCount,
                degree: n.degree,
                reason: getCentralNodeReason(ctx.locale, n.degree),
              })),
              summary: getCentralConceptsFallbackSummary(ctx.locale),
            },
            filteringOptions: [],
            clusteringSuggestions: [],
            axisSuggestions: {
              x_axis: [],
              y_axis: [],
            },
            layoutSuggestions: [],
          },
        };
      }
    }),

  summarizeCommunities: protectedProcedure
    .input(
      z.object({
        communities: z.array(
          z.object({
            communityId: z.string(),
            memberNodeNames: z.array(z.string()),
            memberNodeLabels: z.array(z.string()).optional(),
            internalEdges: z.string().optional(), // コミュニティ内のエッジ情報
            externalConnections: z.string().optional(), // 他のコミュニティへの接続情報
          }),
        ),
        curatorialContext: CuratorialContextSchema.optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { communities, curatorialContext } = input;

      if (communities.length === 0) {
        return {
          summaries: [],
          narrativeFlow: [],
        };
      }

      const llm = new ChatOpenAI({
        temperature: 0.3,
        model: "gpt-4o-mini",
      });

      const stance = curatorialContext?.stance
        ? `Stance: ${curatorialContext.stance}`
        : "Stance: Neutral/Undefined";

      const systemPrompt = getSummarizeCommunitiesSystemPrompt(
        ctx.locale,
        stance,
      );

      const communitiesText = communities
        .map(
          (c, idx) => `
Community ${idx + 1} (ID: ${c.communityId}):
- Members: ${c.memberNodeNames.slice(0, 20).join(", ")}${c.memberNodeNames.length > 20 ? "..." : ""}
- Labels: ${c.memberNodeLabels?.slice(0, 10).join(", ") ?? "N/A"}
- Internal Relationships (within community): ${c.internalEdges ?? "None"}
- External Connections (to other communities): ${c.externalConnections ?? "None (isolated community)"}
`,
        )
        .join("\n");

      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: getSummarizeCommunitiesUserPrompt(
            ctx.locale,
            communitiesText,
          ),
        },
      ]);

      const responseText = response.content as string;

      // JSONを抽出
      let jsonText = responseText.trim();
      if (jsonText.includes("```json")) {
        jsonText =
          jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
      } else if (jsonText.includes("```")) {
        jsonText =
          jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
      }

      try {
        const result = JSON.parse(jsonText) as {
          summaries: Array<{
            communityId: string;
            title: string;
            summary: string;
          }>;
          narrativeFlow: Array<{
            communityId: string;
            order: number;
            transitionText: string;
          }>;
        };

        // コミュニティIDの存在確認
        const validSummaries = result.summaries.filter((s) =>
          communities.some((c) => c.communityId === s.communityId),
        );

        // ナラティブフローを順序でソート
        const sortedFlow = result.narrativeFlow
          .filter((n) =>
            communities.some((c) => c.communityId === n.communityId),
          )
          .sort((a, b) => a.order - b.order)
          .slice(0, 10); // 最大10個までに制限

        // ストーリーに選ばれなかったコミュニティのタイトルを生成
        const narrativeFlowCommunityIds = new Set(
          sortedFlow.map((f) => f.communityId),
        );
        const missingTitleCommunities = communities.filter(
          (c) => !narrativeFlowCommunityIds.has(c.communityId),
        );

        // ストーリーに選ばれなかったコミュニティのタイトルのみを生成
        let additionalSummaries: Array<{
          communityId: string;
          title: string;
          summary: string;
        }> = [];

        if (missingTitleCommunities.length > 0) {
          console.log(
            `Missing titles for ${missingTitleCommunities.length} communities, generating titles...`,
          );
          try {
            const titleGenerationPrompt = getMissingCommunityTitlesUserPrompt(
              ctx.locale,
              missingTitleCommunities
                .map(
                  (c, idx) => `
Community ${idx + 1} (ID: ${c.communityId}):
- Members: ${c.memberNodeNames.slice(0, 20).join(", ")}${c.memberNodeNames.length > 20 ? "..." : ""}
- Labels: ${c.memberNodeLabels?.slice(0, 10).join(", ") ?? "N/A"}
- Internal Relationships: ${c.internalEdges ?? "None"}
`,
                )
                .join("\n"),
            );

            const titleResponse = await llm.invoke([
              {
                role: "system",
                content: getMissingCommunityTitlesSystemPrompt(ctx.locale),
              },
              { role: "user", content: titleGenerationPrompt },
            ]);

            const titleResponseText = titleResponse.content as string;
            let titleJsonText = titleResponseText.trim();
            if (titleJsonText.includes("```json")) {
              titleJsonText =
                titleJsonText.split("```json")[1]?.split("```")[0]?.trim() ??
                titleJsonText;
            } else if (titleJsonText.includes("```")) {
              titleJsonText =
                titleJsonText.split("```")[1]?.split("```")[0]?.trim() ??
                titleJsonText;
            }

            const titleResult = JSON.parse(titleJsonText) as {
              titles: Array<{ communityId: string; title: string }>;
            };

            additionalSummaries = missingTitleCommunities.map((c) => {
              const generatedTitle = titleResult.titles.find(
                (t) => t.communityId === c.communityId,
              );
              return {
                communityId: c.communityId,
                title:
                  generatedTitle?.title ??
                  getDefaultCommunityTitle(ctx.locale, c.communityId),
                summary: "",
              };
            });
          } catch (titleError) {
            console.error("Failed to generate missing titles:", titleError);
            // フォールバック: デフォルトタイトルを使用
            additionalSummaries = missingTitleCommunities.map((c) => ({
              communityId: c.communityId,
              title: getDefaultCommunityTitle(ctx.locale, c.communityId),
              summary: "",
            }));
          }
        }

        // 全てのコミュニティのタイトルを含むsummariesを作成
        const allSummaries = [...validSummaries, ...additionalSummaries];

        return {
          summaries: allSummaries,
          narrativeFlow: sortedFlow,
        };
      } catch (error) {
        console.error("Failed to parse community summaries JSON", error);
        // フォールバック: コミュニティIDをそのまま使用
        return {
          summaries: communities.map((c) => ({
            communityId: c.communityId,
            title: getDefaultCommunityTitle(ctx.locale, c.communityId),
            summary: getDefaultCommunitySummary(
              ctx.locale,
              c.memberNodeNames.length,
            ),
          })),
          narrativeFlow: communities
            .slice(0, 10) // 最大10個までに制限
            .map((c, idx) => ({
              communityId: c.communityId,
              order: idx + 1,
              transitionText: getDefaultTransitionText(ctx.locale),
            })),
        };
      }
    }),

  generateMetaGraph: protectedProcedure
    .input(
      z.object({
        graphDocument: GraphDocumentFrontendSchema,
        minCommunitySize: z.number().optional().default(3),
      }),
    )
    .mutation(async ({ input }) => {
      const { graphDocument, minCommunitySize } = input;

      if (!graphDocument?.nodes?.length) {
        return {
          metaNodes: [],
          metaGraph: { nodes: [], relationships: [] },
          communityMap: {},
          preparedCommunities: [],
        };
      }

      try {
        // Graphologyグラフを作成
        const graph = new Graph();

        // ノードを追加
        graphDocument.nodes.forEach((node) => {
          graph.addNode(node.id, {
            name: node.name,
            label: node.label,
            properties: node.properties,
          });
        });

        // エッジを追加（無向グラフとして）
        graphDocument.relationships.forEach((rel) => {
          if (!graph.hasEdge(rel.sourceId, rel.targetId)) {
            graph.addEdge(rel.sourceId, rel.targetId, {
              type: rel.type,
              properties: rel.properties,
              weight: 1,
            });
          }
        });

        // Louvainアルゴリズムでコミュニティ検出
        const communities = louvain(graph);

        // コミュニティIDごとにノードをグループ化
        const communityGroups = new Map<string, string[]>();
        const communityMap: Record<string, string> = {};

        graphDocument.nodes.forEach((node) => {
          const communityId = communities[node.id] ?? "unassigned";
          const commIdStr = communityId.toString();
          if (!communityGroups.has(commIdStr)) {
            communityGroups.set(commIdStr, []);
          }
          communityGroups.get(commIdStr)!.push(node.id);
          communityMap[node.id] = commIdStr;
        });

        // コミュニティごとの内部エッジと外部接続を計算
        const communityInternalEdges = new Map<
          string,
          Array<{ sourceName: string; targetName: string; type: string }>
        >();
        const communityExternalConnections = new Map<
          string,
          Map<string, { count: number; types: Set<string> }>
        >();

        // 各コミュニティのエッジを分類
        graphDocument.relationships.forEach((rel) => {
          const sourceCommunity = communities[rel.sourceId] ?? "unassigned";
          const targetCommunity = communities[rel.targetId] ?? "unassigned";
          const sourceNode = graphDocument.nodes.find(
            (n) => n.id === rel.sourceId,
          );
          const targetNode = graphDocument.nodes.find(
            (n) => n.id === rel.targetId,
          );

          if (!sourceNode || !targetNode) return;

          if (sourceCommunity === targetCommunity) {
            // 内部エッジ
            const commIdStr = sourceCommunity.toString();
            if (!communityInternalEdges.has(commIdStr)) {
              communityInternalEdges.set(commIdStr, []);
            }
            communityInternalEdges.get(commIdStr)!.push({
              sourceName: sourceNode.name,
              targetName: targetNode.name,
              type: rel.type,
            });
          } else {
            // 外部エッジ
            const commId = sourceCommunity.toString();
            const targetCommId = targetCommunity.toString();

            if (!communityExternalConnections.has(commId)) {
              communityExternalConnections.set(commId, new Map());
            }
            const connections = communityExternalConnections.get(commId)!;

            if (!connections.has(targetCommId)) {
              connections.set(targetCommId, { count: 0, types: new Set() });
            }
            const conn = connections.get(targetCommId)!;
            conn.count += 1;
            conn.types.add(rel.type);
          }
        });

        // メタノードを作成
        const allMetaNodes = Array.from(communityGroups.entries()).map(
          ([communityId, memberNodeIds]) => {
            const memberNodes = memberNodeIds
              .map((id) => graphDocument.nodes.find((n) => n.id === id))
              .filter((n) => n !== undefined);

            const internalEdges =
              communityInternalEdges.get(communityId)?.slice(0, 20) ?? [];
            const externalConnMap =
              communityExternalConnections.get(communityId);
            const externalConnections = externalConnMap
              ? Array.from(externalConnMap.entries()).map(
                  ([targetCommId, data]) => ({
                    targetCommunityId: targetCommId,
                    edgeCount: data.count,
                    edgeTypes: Array.from(data.types),
                  }),
                )
              : [];

            return {
              communityId,
              memberNodeIds,
              memberNodeNames: memberNodes.map((n) => n.name),
              size: memberNodeIds.length,
              internalEdges,
              externalConnections,
              hasExternalConnections: externalConnections.length > 0,
            };
          },
        );

        // フィルタリング：独立した小さなコミュニティを除外
        const filteredMetaNodes = allMetaNodes.filter((metaNode) => {
          if (metaNode.hasExternalConnections) return true;
          return metaNode.size > minCommunitySize;
        });

        // メタエッジを作成（コミュニティ間のエッジを集約）
        const metaEdgesMap = new Map<
          string,
          { count: number; types: Set<string> }
        >();

        graphDocument.relationships.forEach((rel) => {
          const sourceCommunity = communities[rel.sourceId] ?? "unassigned";
          const targetCommunity = communities[rel.targetId] ?? "unassigned";

          if (sourceCommunity !== targetCommunity) {
            const edgeKey = `${sourceCommunity}-${targetCommunity}`;
            const reverseKey = `${targetCommunity}-${sourceCommunity}`;
            const key = edgeKey < reverseKey ? edgeKey : reverseKey;
            const existing = metaEdgesMap.get(key);

            if (existing) {
              existing.count += 1;
              existing.types.add(rel.type);
            } else {
              metaEdgesMap.set(key, {
                count: 1,
                types: new Set([rel.type]),
              });
            }
          }
        });

        // メタグラフのノード（コミュニティ）を作成
        const metaGraphNodes = filteredMetaNodes.map((metaNode) => ({
          id: metaNode.communityId,
          name: `Community ${metaNode.communityId}`,
          label: "Community",
          properties: {
            size: String(metaNode.size),
            memberCount: String(metaNode.size),
            memberNames: metaNode.memberNodeNames.slice(0, 10).join(", "),
          },
          topicSpaceId: undefined,
          documentGraphId: undefined,
          neighborLinkCount: metaNode.externalConnections.length,
          visible: true,
        }));

        // メタグラフのエッジを作成（filteredMetaNodes に存在するコミュニティ間のエッジのみ）
        const validCommunityIds = new Set(
          filteredMetaNodes.map((n) => n.communityId),
        );
        const metaGraphRelationships = Array.from(metaEdgesMap.entries())
          .filter(([edgeKey]) => {
            const [sourceCommunity, targetCommunity] = edgeKey.split("-");
            return (
              validCommunityIds.has(sourceCommunity ?? "") &&
              validCommunityIds.has(targetCommunity ?? "")
            );
          })
          .map(([edgeKey, edgeData], index) => {
            const [sourceCommunity, targetCommunity] = edgeKey.split("-");
            return {
              id: `meta-edge-${index}`,
              type: Array.from(edgeData.types).join(", "),
              properties: {
                weight: String(edgeData.count),
                edgeCount: String(edgeData.count),
              },
              sourceId: sourceCommunity ?? "",
              targetId: targetCommunity ?? "",
              topicSpaceId: undefined,
              documentGraphId: undefined,
            };
          });

        const metaGraph: GraphDocumentForFrontend = {
          nodes: metaGraphNodes,
          relationships: metaGraphRelationships,
        };

        // LLMに送る形式で前処理済みコミュニティデータを作成
        const preparedCommunities = filteredMetaNodes.map((metaNode) => {
          const memberNodes = metaNode.memberNodeIds
            .map((id) => graphDocument.nodes.find((n) => n.id === id))
            .filter((n) => n !== undefined);
          const labels = memberNodes.map((n) => n.label);

          // 全内部エッジ情報（制限なし、構造化）
          const allInternalEdges = metaNode.internalEdges.map((edge) => {
            // 元のrelationshipからプロパティ情報を取得
            const sourceRel = graphDocument.relationships.find(
              (r) =>
                r.sourceId === edge.sourceName &&
                r.targetId === edge.targetName &&
                r.type === edge.type,
            );
            // ノードIDからrelationshipを検索（より正確）
            const sourceNode = graphDocument.nodes.find(
              (n) => n.name === edge.sourceName,
            );
            const targetNode = graphDocument.nodes.find(
              (n) => n.name === edge.targetName,
            );
            const rel =
              sourceNode && targetNode
                ? graphDocument.relationships.find(
                    (r) =>
                      r.sourceId === sourceNode.id &&
                      r.targetId === targetNode.id &&
                      r.type === edge.type,
                  )
                : sourceRel;

            return {
              sourceId: sourceNode?.id ?? "",
              sourceName: edge.sourceName,
              targetId: targetNode?.id ?? "",
              targetName: edge.targetName,
              type: edge.type,
              properties: rel?.properties ?? {},
            };
          });

          // 外部接続の情報を文字列化（要約用）
          const externalConnectionsText = metaNode.externalConnections
            .map(
              (conn) =>
                `Community ${conn.targetCommunityId} (${conn.edgeCount} edges: ${conn.edgeTypes.join(", ")})`,
            )
            .join(", ");

          // summarizeCommunities用の簡易版（後方互換性のため）
          const internalEdgesText = metaNode.internalEdges
            .slice(0, 10)
            .map((e) => `${e.sourceName} --[${e.type}]--> ${e.targetName}`)
            .join(", ");

          return {
            communityId: metaNode.communityId,
            memberNodeNames: metaNode.memberNodeNames,
            memberNodeLabels: labels,
            // 簡易版（summarizeCommunities用）
            internalEdges: internalEdgesText || undefined,
            externalConnections: externalConnectionsText || undefined,
            // 詳細版（generateCommunityStory用）
            memberNodes: memberNodes.map((n) => ({
              id: n.id,
              name: n.name,
              label: n.label,
              properties: n.properties ?? {},
            })),
            internalEdgesDetailed: allInternalEdges,
          };
        });

        return {
          metaNodes: filteredMetaNodes,
          metaGraph,
          communityMap,
          preparedCommunities,
        };
      } catch (error) {
        console.error("Failed to generate meta graph:", error);
        return {
          metaNodes: [],
          metaGraph: { nodes: [], relationships: [] },
          communityMap: {},
          preparedCommunities: [],
        };
      }
    }),

  generateMetaGraphFromText: protectedProcedure
    .input(
      z.object({
        graphDocument: GraphDocumentFrontendSchema,
        workspaceContent: z.unknown(), // TipTap JSONContent (doc with content array)
        minCommunitySize: z.number().optional().default(3),
        workspaceId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        graphDocument: inputGraphDocument,
        workspaceContent,
        minCommunitySize,
        workspaceId,
      } = input;

      const contentArray = Array.isArray(
        (workspaceContent as { content?: unknown })?.content,
      )
        ? (workspaceContent as { content: JSONContent[] }).content
        : [];

      // 本文KG統合: workspaceId がある場合、本文からKGを抽出して TopicSpace に統合（エラー時はユーザーへ伝播）
      let graphDocument: GraphDoc = inputGraphDocument;
      if (workspaceId && contentArray.length > 0) {
        graphDocument = await integrateWorkspaceTextGraph(
          ctx,
          workspaceId,
          contentArray,
          inputGraphDocument,
          ctx.locale,
        );
      }

      if (!graphDocument?.nodes?.length) {
        return {
          metaNodes: [],
          metaGraph: { nodes: [], relationships: [] },
          communityMap: {} as Record<string, string>,
          preparedCommunities: [],
          narrativeFlow: [],
          summaries: [],
          detailedStories: {} as Record<string, string | JSONContent>,
        };
      }

      const sections = extractSectionsWithSegments(contentArray);
      if (sections.length === 0) {
        return {
          metaNodes: [],
          metaGraph: { nodes: [], relationships: [] },
          communityMap: {} as Record<string, string>,
          preparedCommunities: [],
          narrativeFlow: [],
          summaries: [],
          detailedStories: {} as Record<string, string | JSONContent>,
        };
      }

      const communityData = assignCommunitiesToSections(
        graphDocument,
        sections,
      );
      return await buildMetaGraphFromTextSections(
        graphDocument,
        communityData,
        sections,
        minCommunitySize,
        ctx.locale,
      );
    }),

  generateCommunityStory: protectedProcedure
    .input(
      z.object({
        communityId: z.string(),
        // 後方互換性のため残す
        memberNodeNames: z.array(z.string()).optional(),
        memberNodeLabels: z.array(z.string()).optional(),
        internalEdges: z.string().optional(),
        externalConnections: z.string().optional(),
        // 詳細情報（新規）
        memberNodes: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              label: z.string(),
              properties: z.record(z.any()).optional(),
            }),
          )
          .optional(),
        internalEdgesDetailed: z
          .array(
            z.object({
              sourceId: z.string(),
              sourceName: z.string(),
              targetId: z.string(),
              targetName: z.string(),
              type: z.string(),
              properties: z.record(z.any()).optional(),
            }),
          )
          .optional(),
        curatorialContext: CuratorialContextSchema.optional().nullable(),
        workspaceId: z.string().optional(),
        /** ナラティブ内の前後のコミュニティ情報。繋がりを意識した本文生成に使う */
        narrativeContext: z
          .object({
            previousSummary: z.string().optional(),
            previousTitle: z.string().optional(),
            nextSummary: z.string().optional(),
            nextTitle: z.string().optional(),
            transitionTextBefore: z.string().optional(),
            transitionTextAfter: z.string().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const {
        communityId,
        memberNodeNames,
        memberNodeLabels,
        internalEdges,
        externalConnections,
        memberNodes,
        internalEdgesDetailed,
        curatorialContext,
        workspaceId,
        narrativeContext,
      } = input;

      const llm = new ChatOpenAI({
        temperature: 0.3,
        model: "gpt-4o-mini",
      });

      const wordCount = 200;

      // キーワード抽出関数
      const extractKeywords = (
        nodes: typeof memberNodes,
        edges: typeof internalEdgesDetailed,
      ): string[] => {
        const keywords = new Set<string>();

        // ノード名を追加
        if (nodes) {
          nodes.forEach((node) => {
            if (node.name && node.name.length > 1) {
              keywords.add(node.name);
            }
            // ノードのプロパティから値も抽出
            if (node.properties) {
              Object.values(node.properties).forEach((value) => {
                if (
                  typeof value === "string" &&
                  value.length > 1 &&
                  value.length < 50
                ) {
                  // 日本語の助詞や接続詞を除去
                  const cleaned = value
                    .replace(/[のをにへとがでからよりまで]/g, "")
                    .trim();
                  if (cleaned.length > 1) {
                    keywords.add(cleaned);
                  }
                }
              });
            }
          });
        }

        // エッジタイプを追加
        if (edges) {
          edges.forEach((edge) => {
            if (edge.type && edge.type.length > 1) {
              keywords.add(edge.type);
            }
            // エッジのプロパティから値も抽出
            if (edge.properties) {
              Object.values(edge.properties).forEach((value) => {
                if (
                  typeof value === "string" &&
                  value.length > 1 &&
                  value.length < 50
                ) {
                  const cleaned = value
                    .replace(/[のをにへとがでからよりまで]/g, "")
                    .trim();
                  if (cleaned.length > 1) {
                    keywords.add(cleaned);
                  }
                }
              });
            }
          });
        }

        // 最大20個に制限
        return Array.from(keywords).slice(0, 20);
      };

      // SourceDocumentから関連セクションを取得
      let sourceDocumentSections: string[] = [];
      if (workspaceId) {
        try {
          const workspace = await ctx.db.workspace.findFirst({
            where: {
              id: workspaceId,
              isDeleted: false,
              OR: [
                { userId: ctx.session.user.id },
                { collaborators: { some: { id: ctx.session.user.id } } },
              ],
            },
            include: {
              referencedTopicSpaces: {
                where: { isDeleted: false },
                include: {
                  sourceDocuments: {
                    where: { isDeleted: false },
                  },
                },
              },
            },
          });

          if (workspace && workspace.referencedTopicSpaces.length > 0) {
            // キーワードを抽出
            const keywords = extractKeywords(
              memberNodes,
              internalEdgesDetailed,
            );

            if (keywords.length > 0) {
              // すべてのSourceDocumentを収集
              const allSourceDocuments: Array<{
                id: string;
                topicSpaceName: string;
              }> = [];
              workspace.referencedTopicSpaces.forEach((topicSpace) => {
                topicSpace.sourceDocuments.forEach((doc) => {
                  allSourceDocuments.push({
                    id: doc.id,
                    topicSpaceName: topicSpace.name,
                  });
                });
              });

              // 各SourceDocumentからセクションを取得（並列処理、タイムアウト付き）
              const sectionPromises = allSourceDocuments.map(async (doc) => {
                try {
                  const timeoutPromise = new Promise<string[]>((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")), 10000),
                  );
                  const referencePromise = getTextReference(
                    ctx,
                    doc.id,
                    keywords,
                    300, // contextLength: 300文字（前後150文字）
                  );
                  const sections = await Promise.race([
                    referencePromise,
                    timeoutPromise,
                  ]);
                  return sections.map((section) => ({
                    section,
                    topicSpaceName: doc.topicSpaceName,
                  }));
                } catch (error) {
                  console.warn(
                    `Failed to get text reference for document ${doc.id}:`,
                    error,
                  );
                  return [];
                }
              });

              const allSections = await Promise.all(sectionPromises);
              const flattenedSections = allSections.flat();

              // 重複除去（最初の50文字が同じセクションは重複とみなす）
              const seen = new Set<string>();
              const uniqueSections = flattenedSections.filter((item) => {
                const prefix = item.section.substring(0, 50);
                if (seen.has(prefix)) {
                  return false;
                }
                seen.add(prefix);
                return true;
              });

              // キーワードマッチ数を計算してソート
              const sectionsWithScore = uniqueSections.map((item) => {
                const matchCount = keywords.filter((keyword) =>
                  item.section.includes(keyword),
                ).length;
                return { ...item, matchCount };
              });

              // マッチ数が多い順にソートし、最大8個に制限
              sectionsWithScore.sort((a, b) => b.matchCount - a.matchCount);
              sourceDocumentSections = sectionsWithScore
                .slice(0, 8)
                .map((item) => item.section);
            }
          }
        } catch (error) {
          console.warn(
            `Failed to get source documents for workspace ${workspaceId}:`,
            error,
          );
          // エラーが発生しても処理を継続
        }
      }

      const stance = curatorialContext?.stance
        ? `Stance: ${curatorialContext.stance}`
        : "Stance: Neutral/Undefined";

      const narrativeContextBlock =
        narrativeContext &&
        (narrativeContext.previousTitle ??
          narrativeContext.nextTitle ??
          narrativeContext.transitionTextBefore ??
          narrativeContext.transitionTextAfter)
          ? `
[Narrative Context - write so this community connects naturally in the story]
${(narrativeContext.previousTitle ?? narrativeContext.previousSummary) ? `- Previous theme: ${narrativeContext.previousTitle ?? ""} ${(narrativeContext.previousSummary ?? "").slice(0, 150)}${(narrativeContext.previousSummary ?? "").length > 150 ? "..." : ""}` : ""}
${narrativeContext.transitionTextBefore?.trim() ? `- Transition into this community: ${narrativeContext.transitionTextBefore.trim()}` : ""}
${(narrativeContext.nextTitle ?? narrativeContext.nextSummary) ? `- Next theme: ${narrativeContext.nextTitle ?? ""} ${(narrativeContext.nextSummary ?? "").slice(0, 150)}${(narrativeContext.nextSummary ?? "").length > 150 ? "..." : ""}` : ""}
${narrativeContext.transitionTextAfter?.trim() ? `- Transition after this community: ${narrativeContext.transitionTextAfter.trim()}` : ""}
- Keep the same language and tone so the overall narrative flows smoothly.`
          : "";

      // 詳細情報がある場合はそれを使用、なければ簡易版を使用
      // memberNodes があればセグメント構造化ストーリーを生成（internalEdgesDetailed はオプション）
      const hasDetailedInfo = !!memberNodes && memberNodes.length > 0;
      const hasEdgeInfo =
        !!internalEdgesDetailed && internalEdgesDetailed.length > 0;
      const validNodeIds = new Set(memberNodes?.map((n) => n.id) ?? []);
      const validEdgeIds = new Set(
        internalEdgesDetailed?.map((e) =>
          toEdgeCompositeKey(e.sourceId, e.targetId, e.type),
        ) ?? [],
      );

      const systemPrompt = getGenerateCommunityStorySystemPrompt(ctx.locale, {
        stance,
        narrativeContextBlock: narrativeContextBlock ?? "",
        hasDetailedInfo,
        hasEdgeInfo,
        wordCount,
      });

      const communityInfo = hasDetailedInfo
        ? `
Community ID: ${communityId}

[Members (${memberNodes?.length ?? 0} nodes)] - use "id" in nodeIds
${(memberNodes ?? [])
  .map(
    (node, idx) =>
      `${idx + 1}. id: "${node.id}" | ${node.name} (${node.label})${
        node.properties && Object.keys(node.properties).length > 0
          ? ` | Properties: ${JSON.stringify(node.properties)}`
          : ""
      }`,
  )
  .join("\n")}
${
  hasEdgeInfo
    ? `
[Internal Relationships (${internalEdgesDetailed?.length ?? 0} edges)]
${(internalEdgesDetailed ?? [])
  .map(
    (edge, idx) =>
      `${idx + 1}. ${edge.sourceName} --[${edge.type}]--> ${edge.targetName}${
        edge.properties && Object.keys(edge.properties).length > 0
          ? ` | Properties: ${JSON.stringify(edge.properties)}`
          : ""
      }`,
  )
  .join("\n")}

[Edge IDs for output] - use EXACTLY these strings in edgeIds
${(internalEdgesDetailed ?? [])
  .map((e) => toEdgeCompositeKey(e.sourceId, e.targetId, e.type))
  .join("\n")}`
    : `
[Internal Relationships]
${internalEdges ?? "No detailed edge data available"}
`
}

[External Connections]
${externalConnections ?? "None (isolated community)"}
`
        : `
Community ID: ${communityId}
- Members: ${memberNodeNames?.slice(0, 30).join(", ") ?? "N/A"}${(memberNodeNames?.length ?? 0) > 30 ? "..." : ""}
- Labels: ${memberNodeLabels?.slice(0, 15).join(", ") ?? "N/A"}
- Internal Relationships: ${internalEdges ?? "None"}
- External Connections: ${externalConnections ?? "None (isolated community)"}
`;

      // ユーザープロンプトを構築
      let userPrompt = getGenerateCommunityStoryUserPrompt(ctx.locale, {
        hasDetailedInfo,
        communityInfo,
        wordCount,
      });

      // SourceDocumentのセクションがある場合は追加
      if (sourceDocumentSections.length > 0) {
        userPrompt += getSourceDocumentReferencesHeader(ctx.locale);
        userPrompt += sourceDocumentSections
          .map((section, idx) => `--- Reference ${idx + 1} ---\n${section}`)
          .join("\n\n");
      }

      if (hasDetailedInfo) {
        userPrompt += "\n\nOutput valid JSON only (no markdown code fence).";
      }

      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userPrompt,
        },
      ]);

      const responseText = (response.content as string).trim();

      if (hasDetailedInfo) {
        let jsonText = responseText;
        if (jsonText.includes("```json")) {
          jsonText =
            jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
        } else if (jsonText.includes("```")) {
          jsonText =
            jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
        }
        try {
          const parsed = JSON.parse(jsonText) as {
            segments?: Array<{
              text?: string;
              nodeIds?: string[];
              edgeIds?: string[];
            }>;
          };
          const rawSegments = Array.isArray(parsed.segments)
            ? parsed.segments
            : [];
          const segments: StorySegment[] = rawSegments
            .filter((s) => s && typeof s.text === "string" && s.text.trim())
            .map((s) => ({
              text: (s.text ?? "").trim(),
              nodeIds: Array.isArray(s.nodeIds)
                ? s.nodeIds.filter((id) => validNodeIds.has(id))
                : [],
              edgeIds: Array.isArray(s.edgeIds)
                ? s.edgeIds.filter((id) => validEdgeIds.has(id))
                : [],
              source: "generated",
            }));
          const story =
            segments.length > 0
              ? segments.map((s) => s.text).join("\n\n")
              : responseText;
          return {
            communityId,
            segments,
            story,
          };
        } catch (e) {
          console.warn(
            "generateCommunityStory: JSON parse failed, falling back to plain text",
            e,
          );
        }
      }

      return {
        communityId,
        story: responseText,
        segments: [],
      };
    }),

  annotateStorySegments: protectedProcedure
    .input(
      z.object({
        communityId: z.string(),
        segments: z.array(z.object({ text: z.string() })).optional(),
        fullText: z.string().optional(),
        memberNodes: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              label: z.string(),
              properties: z.record(z.any()).optional(),
            }),
          )
          .optional(),
        internalEdgesDetailed: z
          .array(
            z.object({
              sourceId: z.string(),
              sourceName: z.string(),
              targetId: z.string(),
              targetName: z.string(),
              type: z.string(),
              properties: z.record(z.any()).optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        communityId,
        segments: inputSegments,
        fullText,
        memberNodes,
        internalEdgesDetailed,
      } = input;

      let segmentsToAnnotate: Array<{ text: string }>;
      if (inputSegments?.length) {
        segmentsToAnnotate = inputSegments;
      } else if (fullText?.trim()) {
        segmentsToAnnotate = fullText
          .split(/\n\n+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((text) => ({ text }));
      } else {
        return { communityId, segments: [] };
      }

      return runAnnotateStorySegments(
        communityId,
        segmentsToAnnotate,
        memberNodes ?? [],
        internalEdgesDetailed ?? [],
        ctx.locale,
      );
    }),

  regenerateNarrativeFlow: protectedProcedure
    .input(
      z.object({
        orderedCommunityIds: z.array(z.string()),
        communities: z.array(PreparedCommunitySchema),
        curatorialContext: CuratorialContextSchema.optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { orderedCommunityIds, communities, curatorialContext } = input;

      if (orderedCommunityIds.length === 0) {
        return {
          narrativeFlow: [],
        };
      }

      // 順序に従ってコミュニティを並べ替え
      const orderedCommunities = orderedCommunityIds
        .map((id) => communities.find((c) => c.communityId === id))
        .filter(
          (c): c is z.infer<typeof PreparedCommunitySchema> => c !== undefined,
        );

      // マッチするコミュニティがなくても順序は維持する（空で返すとクライアントでストーリーが消える）
      if (orderedCommunities.length === 0) {
        return {
          narrativeFlow: orderedCommunityIds.map((id, index) => ({
            communityId: id,
            order: index + 1,
            transitionText: "",
          })),
        };
      }

      const llm = new ChatOpenAI({
        temperature: 0.3,
        model: "gpt-4o-mini",
      });

      const stance = curatorialContext?.stance
        ? `Stance: ${curatorialContext.stance}`
        : "Stance: Neutral/Undefined";

      const systemPrompt = getRegenerateNarrativeFlowSystemPrompt(
        ctx.locale,
        stance,
      );

      const communitiesText = orderedCommunities
        .map(
          (c, idx) => `
Order ${idx + 1}: Community ${c.communityId}
- Members: ${c.memberNodeNames.slice(0, 20).join(", ")}
- Labels: ${c.memberNodeLabels?.slice(0, 10).join(", ") ?? "N/A"}
- Internal Theme: ${c.internalEdges ?? "See detailed info"}
- External Connections: ${c.externalConnections ?? "None"}
`,
        )
        .join("\n");

      console.log(
        `Regenerating transitions for ${orderedCommunities.length} communities`,
      );

      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: getRegenerateNarrativeFlowUserPrompt(
            ctx.locale,
            communitiesText,
          ),
        },
      ]);

      const responseText = response.content as string;
      console.log(
        "LLM Response for transitions:",
        responseText.substring(0, 200) + "...",
      );

      // JSONを抽出
      let jsonText = responseText.trim();
      if (jsonText.includes("```json")) {
        jsonText =
          jsonText.split("```json")[1]?.split("```")[0]?.trim() ?? jsonText;
      } else if (jsonText.includes("```")) {
        jsonText =
          jsonText.split("```")[1]?.split("```")[0]?.trim() ?? jsonText;
      }

      try {
        const result = JSON.parse(jsonText) as {
          narrativeFlow: Array<{
            communityId: string;
            order: number;
            transitionText: string;
          }>;
        };

        // LLMが全てのコミュニティを含めていない場合や、順序が間違っている場合のフォールバック
        // 入力された順序を維持し、LLMの結果をマージする
        const finalFlow = orderedCommunityIds.map((id, index) => {
          // IDで検索
          let llmResult = result.narrativeFlow.find(
            (flow) => String(flow.communityId) === String(id),
          );

          // IDで見つからない場合は順序(order)で検索
          if (!llmResult) {
            llmResult = result.narrativeFlow.find(
              (flow) => flow.order === index + 1,
            );
          }

          return {
            communityId: id,
            order: index + 1,
            transitionText: llmResult?.transitionText ?? "",
          };
        });

        return {
          narrativeFlow: finalFlow,
        };
      } catch (error) {
        console.error("Failed to parse narrative flow JSON", error);
        // フォールバック: 単純な順序のみ返す
        return {
          narrativeFlow: orderedCommunityIds.map((id, index) => ({
            communityId: id,
            order: index + 1,
            transitionText: "",
          })),
        };
      }
    }),

  /**
   * エッジ述語をCDT（概念依存理論）の8カテゴリに分類し、アニメーション設定を返す。
   * DBキャッシュを活用し、未分類のエッジのみLLMに問い合わせる。
   * DancingBoard (IUI 2025) の Appendix A プロンプト構造を参考にしている。
   */
  classifyEdgeMotion: protectedProcedure
    .input(
      z.object({
        topicSpaceId: z.string(),
        edges: z.array(
          z.object({
            edgeId: z.string(),
            edgeType: z.string(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => runClassifyEdgeMotion(ctx.db, input)),
};
