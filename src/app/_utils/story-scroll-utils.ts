import type { MetaGraphStoryData } from "@/app/_hooks/use-meta-graph-story";

export interface ScrollStep {
  id: string;
  communityId: string;
  communityTitle?: string;
  text: string;
  nodeIds: string[];
  edgeIds: string[];
}

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
