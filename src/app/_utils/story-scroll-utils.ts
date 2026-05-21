import type { MetaGraphStoryData } from "@/app/_hooks/use-meta-graph-story";
import { getEdgeCompositeKeyFromLink } from "@/app/const/story-segment";

export interface ScrollStep {
  id: string;
  communityId: string;
  communityTitle?: string;
  text: string;
  nodeIds: string[];
  edgeIds: string[];
  /** コミュニティ間の繋がり文（transitionText）のステップなら true */
  isTransition?: boolean;
}

/** レイアウト用フォーカス解決に必要なステップフィールド（RecordingStep 等も可） */
export type ScrollStepGraphFocus = Pick<
  ScrollStep,
  "id" | "communityId" | "nodeIds" | "edgeIds"
>;

/**
 * MetaGraphStoryData からスクローリーテリング用のステップ配列を組み立てる。
 * narrativeFlow の order 順にコミュニティを並べ、各 detailedStories の段落を 1 ステップとする。
 */
export function buildScrollStepsFromMetaGraphStoryData(
  metaGraphData: MetaGraphStoryData,
): ScrollStep[] {
  const steps: ScrollStep[] = [];
  const communityTitleById = new Map(
    metaGraphData.summaries.map((s) => [s.communityId, s.title]),
  );

  const ordered = [...metaGraphData.narrativeFlow].sort(
    (a, b) => a.order - b.order,
  );

  for (const flowItem of ordered) {
    const communityId = flowItem.communityId;
    const communityTitle = communityTitleById.get(communityId);

    // トランジションテキストの独立ステップとしての追加を廃止
    // if (flowItem.transitionText?.trim()) {
    //   steps.push({
    //     id: `transition-${communityId}`,
    //     communityId,
    //     communityTitle,
    //     text: flowItem.transitionText.trim(),
    //     nodeIds: [],
    //     edgeIds: [],
    //     isTransition: true,
    //   });
    // }

    const storyContent = metaGraphData.detailedStories[communityId];

    if (storyContent == null) {
      const summary = metaGraphData.summaries.find(
        (s) => s.communityId === communityId,
      );
      steps.push({
        id: `${communityId}-0`,
        communityId,
        communityTitle,
        text: summary?.summary ?? "",
        nodeIds: [],
        edgeIds: [],
      });
      continue;
    }

    if (typeof storyContent === "string") {
      const summary = metaGraphData.summaries.find(
        (s) => s.communityId === communityId,
      );
      steps.push({
        id: `${communityId}-0`,
        communityId,
        communityTitle,
        text: storyContent.trim() || (summary?.summary ?? ""),
        nodeIds: [],
        edgeIds: [],
      });
      continue;
    }

    const content = storyContent.content;
    if (!Array.isArray(content)) {
      const summary = metaGraphData.summaries.find(
        (s) => s.communityId === communityId,
      );
      steps.push({
        id: `${communityId}-0`,
        communityId,
        communityTitle,
        text: summary?.summary ?? "",
        nodeIds: [],
        edgeIds: [],
      });
      continue;
    }

    let paragraphIndex = 0;
    for (const node of content) {
      if (node.type !== "paragraph" || !node.content) continue;

      const text = (node.content as Array<{ type?: string; text?: string }>)
        .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
        .join("")
        .trim();

      const attrs = (node.attrs ?? {}) as {
        segmentNodeIds?: string[];
        segmentEdgeIds?: string[];
      };
      const nodeIds = attrs.segmentNodeIds ?? [];
      const edgeIds = attrs.segmentEdgeIds ?? [];

      steps.push({
        id: `${communityId}-${paragraphIndex}`,
        communityId,
        communityTitle,
        text,
        nodeIds,
        edgeIds,
      });
      paragraphIndex += 1;
    }

    if (paragraphIndex === 0) {
      const summary = metaGraphData.summaries.find(
        (s) => s.communityId === communityId,
      );
      steps.push({
        id: `${communityId}-0`,
        communityId,
        communityTitle,
        text: summary?.summary ?? "",
        nodeIds: [],
        edgeIds: [],
      });
    }
  }

  return steps;
}

/**
 * MetaGraphStoryData から全セグメントで参照されているノードIDの重複排除セットを取得。
 * フィルタで「セグメントノードを残す」オプション用。
 */
export function getSegmentNodeIdsFromMetaGraphStoryData(
  metaGraphData: MetaGraphStoryData,
): string[] {
  const steps = buildScrollStepsFromMetaGraphStoryData(metaGraphData);
  const ids = new Set<string>();
  steps.forEach((s) => s.nodeIds.forEach((id) => ids.add(id)));
  return Array.from(ids);
}

type StoryRelationship = {
  sourceId: string;
  targetId: string;
  type: string;
};

function buildCommunityNodeIdsMap(
  communityMap: Record<string, string>,
): Map<string, string[]> {
  const byCommunity = new Map<string, string[]>();
  for (const [nodeId, communityId] of Object.entries(communityMap)) {
    const list = byCommunity.get(communityId);
    if (list) list.push(nodeId);
    else byCommunity.set(communityId, [nodeId]);
  }
  return byCommunity;
}

function buildRelationshipIndexes(relationships: StoryRelationship[]) {
  const relByCompositeKey = new Map<string, StoryRelationship>();
  const incidentByNodeId = new Map<string, StoryRelationship[]>();

  for (const rel of relationships) {
    relByCompositeKey.set(getEdgeCompositeKeyFromLink(rel), rel);
    for (const nodeId of [rel.sourceId, rel.targetId]) {
      const list = incidentByNodeId.get(nodeId);
      if (list) list.push(rel);
      else incidentByNodeId.set(nodeId, [rel]);
    }
  }

  return { relByCompositeKey, incidentByNodeId };
}

/** コミュニティのみ指定のステップを、グラフ表示時と同様に nodeIds/edgeIds へ展開する */
export function resolveScrollStepGraphFocus(
  step: ScrollStepGraphFocus,
  relationships: StoryRelationship[],
  communityMap?: Record<string, string>,
  communityNodeIds?: Map<string, string[]>,
): { nodeIds: string[]; edgeIds: string[] } {
  if (step.id === "__overview__") {
    return { nodeIds: [], edgeIds: [] };
  }

  let nodeIds = step.nodeIds;
  let edgeIds = step.edgeIds;

  if (
    nodeIds.length === 0 &&
    edgeIds.length === 0 &&
    step.communityId &&
    communityMap
  ) {
    nodeIds =
      communityNodeIds?.get(step.communityId) ??
      Object.entries(communityMap)
        .filter(([, cid]) => cid === step.communityId)
        .map(([nodeId]) => nodeId);
    const nodeSet = new Set(nodeIds);
    edgeIds = relationships
      .filter((rel) => nodeSet.has(rel.sourceId) && nodeSet.has(rel.targetId))
      .map((rel) => getEdgeCompositeKeyFromLink(rel));
  }

  return { nodeIds, edgeIds };
}

function addIntraFocusEdgesForStep(
  focusNodeSet: Set<string>,
  edgeSet: Set<string>,
  incidentByNodeId: Map<string, StoryRelationship[]>,
): void {
  const visitedRel = new Set<StoryRelationship>();
  for (const nodeId of focusNodeSet) {
    for (const rel of incidentByNodeId.get(nodeId) ?? []) {
      if (visitedRel.has(rel)) continue;
      visitedRel.add(rel);
      if (focusNodeSet.has(rel.sourceId) && focusNodeSet.has(rel.targetId)) {
        edgeSet.add(getEdgeCompositeKeyFromLink(rel));
      }
    }
  }
}

/**
 * 全セグメントのフォーカスエッジを union し、初回 force レイアウト用の composite key 一覧を返す。
 * 描画フォーカス（現在セグメント）とは独立。セグメント切替でシミュレーションを再実行しないため。
 */
export function getLayoutFocusEdgeIdsFromScrollSteps(
  steps: ScrollStepGraphFocus[],
  relationships: StoryRelationship[],
  communityMap?: Record<string, string>,
): string[] {
  const edgeSet = new Set<string>();
  const { relByCompositeKey, incidentByNodeId } = buildRelationshipIndexes(relationships);
  const communityNodeIds = communityMap
    ? buildCommunityNodeIdsMap(communityMap)
    : undefined;

  for (const step of steps) {
    if (step.id === "__overview__") continue;

    const { nodeIds: stepNodeIds, edgeIds: stepEdgeIds } = resolveScrollStepGraphFocus(
      step,
      relationships,
      communityMap,
      communityNodeIds,
    );

    const focusNodeSet = new Set(stepNodeIds);
    for (const key of stepEdgeIds) {
      edgeSet.add(key);
      const rel = relByCompositeKey.get(key);
      if (rel) {
        focusNodeSet.add(rel.sourceId);
        focusNodeSet.add(rel.targetId);
      }
    }

    addIntraFocusEdgesForStep(focusNodeSet, edgeSet, incidentByNodeId);
  }

  return Array.from(edgeSet);
}

/** MetaGraphStoryData から初回レイアウト用フォーカスエッジ ID を取得 */
export function getLayoutFocusEdgeIdsFromMetaGraphStoryData(
  metaGraphData: MetaGraphStoryData,
  relationships: StoryRelationship[],
): string[] {
  const steps = buildScrollStepsFromMetaGraphStoryData(metaGraphData);
  return getLayoutFocusEdgeIdsFromScrollSteps(
    steps,
    relationships,
    metaGraphData.communityMap,
  );
}
