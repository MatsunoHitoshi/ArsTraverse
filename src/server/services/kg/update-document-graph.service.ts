import type { PrismaClient } from "@prisma/client";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { findDocumentGraphWithGraphAndAssertOwner } from "@/server/repositories/document-graph.repository";
import { computeDocumentGraphDiffFromFrontend } from "./compute-document-graph-diff";
import { applyDocumentGraphChangeData } from "./apply-document-graph-diff.service";

export async function updateDocumentGraph(
  db: PrismaClient,
  params: {
    documentGraphId: string;
    userId: string;
    nodes: NodeTypeForFrontend[];
    relationships: RelationshipTypeForFrontend[];
    description?: string;
  },
) {
  const documentGraph = await findDocumentGraphWithGraphAndAssertOwner(
    db,
    params.documentGraphId,
    params.userId,
  );

  const { nodeDiffs, relationshipDiffs, changeData } =
    computeDocumentGraphDiffFromFrontend(
      documentGraph.graphNodes,
      documentGraph.graphRelationships,
      params.nodes,
      params.relationships,
    );

  await applyDocumentGraphChangeData(db, {
    documentGraphId: params.documentGraphId,
    userId: params.userId,
    description: params.description ?? "グラフを更新しました",
    nodeDiffs,
    relationshipDiffs,
    changeData,
  });

  return {
    nodes: changeData.nodeCreateData,
    relationships: changeData.relationshipCreateData,
  };
}
