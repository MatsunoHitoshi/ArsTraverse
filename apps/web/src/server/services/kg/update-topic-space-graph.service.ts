import type { PrismaClient } from "@prisma/client";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { findTopicSpaceWithGraphAndAssertAdmin } from "@/server/repositories/topic-space-graph.repository";
import { computeTopicSpaceGraphDiffFromFrontend } from "./compute-graph-diff";
import { applyTopicSpaceGraphChangeData } from "./apply-topic-space-graph-diff.service";

export async function updateTopicSpaceGraph(
  db: PrismaClient,
  params: {
    topicSpaceId: string;
    userId: string;
    nodes: NodeTypeForFrontend[];
    relationships: RelationshipTypeForFrontend[];
    description?: string;
  },
) {
  const topicSpace = await findTopicSpaceWithGraphAndAssertAdmin(
    db,
    params.topicSpaceId,
    params.userId,
  );

  const { nodeDiffs, relationshipDiffs, changeData } =
    computeTopicSpaceGraphDiffFromFrontend(
      topicSpace.graphNodes,
      topicSpace.graphRelationships,
      params.nodes,
      params.relationships,
    );

  await applyTopicSpaceGraphChangeData(db, {
    topicSpaceId: params.topicSpaceId,
    userId: params.userId,
    description: params.description ?? "グラフを更新しました",
    nodeDiffs,
    relationshipDiffs,
    changeData,
  });

  return db.topicSpace.findFirst({ where: { id: params.topicSpaceId } });
}
