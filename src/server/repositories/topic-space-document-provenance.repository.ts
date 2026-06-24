import type { GraphEditChange, Prisma, PrismaClient } from "@prisma/client";
import type { DraftGraphData } from "@/server/services/graph-edit-proposal/draft.service";
import { reconstructDraftGraphData } from "@/server/services/graph-edit-proposal/draft.service";

export type TopicSpaceNodeProvenanceRow = {
  graphNodeId: string;
  sourceDocumentId: string;
  localNodeId: string;
};

export type TopicSpaceEdgeProvenanceRow = {
  graphRelationshipId: string;
  sourceDocumentId: string;
};

export async function loadTopicSpaceDocumentProvenanceForExport(
  db: Prisma.TransactionClient | PrismaClient,
  topicSpaceId: string,
): Promise<{
  nodes: TopicSpaceNodeProvenanceRow[];
  relationships: TopicSpaceEdgeProvenanceRow[];
}> {
  const [nodeRows, edgeRows] = await Promise.all([
    db.topicSpaceDocumentNodeProvenance.findMany({
      where: { topicSpaceId },
      select: {
        graphNodeId: true,
        sourceDocumentId: true,
        localNodeId: true,
      },
    }),
    db.topicSpaceDocumentEdgeProvenance.findMany({
      where: { topicSpaceId },
      select: {
        graphRelationshipId: true,
        sourceDocumentId: true,
      },
    }),
  ]);

  return {
    nodes: nodeRows,
    relationships: edgeRows,
  };
}

export function buildSourceDocumentIdsByGraphNodeId(
  nodeProvenance: Array<{ graphNodeId: string; sourceDocumentId: string }>,
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const row of nodeProvenance) {
    const ids = map.get(row.graphNodeId) ?? new Set<string>();
    ids.add(row.sourceDocumentId);
    map.set(row.graphNodeId, ids);
  }
  return new Map(
    Array.from(map.entries()).map(([graphNodeId, ids]) => [
      graphNodeId,
      Array.from(ids),
    ]),
  );
}

export function extractNodeMergePairsFromProposal(
  baseGraphData: DraftGraphData,
  changes: GraphEditChange[],
): Array<{ canonicalNodeId: string; duplicateNodeIds: string[] }> {
  const draftGraphData = reconstructDraftGraphData(baseGraphData, changes);
  const draftNodeIds = new Set(draftGraphData.nodes.map((node) => node.id));
  const removedNodes = baseGraphData.nodes.filter(
    (node) => !draftNodeIds.has(node.id),
  );

  const pairMap = new Map<string, string[]>();
  for (const removed of removedNodes) {
    const canonical = draftGraphData.nodes.find(
      (node) =>
        node.id !== removed.id &&
        node.name === removed.name &&
        node.label === removed.label,
    );
    if (!canonical) {
      continue;
    }
    const duplicates = pairMap.get(canonical.id) ?? [];
    duplicates.push(removed.id);
    pairMap.set(canonical.id, duplicates);
  }

  return Array.from(pairMap.entries()).map(
    ([canonicalNodeId, duplicateNodeIds]) => ({
      canonicalNodeId,
      duplicateNodeIds,
    }),
  );
}

export async function reassignTopicSpaceNodeProvenanceOnMerge(
  tx: Prisma.TransactionClient,
  topicSpaceId: string,
  canonicalNodeId: string,
  duplicateNodeIds: string[],
) {
  if (duplicateNodeIds.length === 0) {
    return;
  }

  await tx.topicSpaceDocumentNodeProvenance.updateMany({
    where: {
      topicSpaceId,
      graphNodeId: { in: duplicateNodeIds },
    },
    data: { graphNodeId: canonicalNodeId },
  });
}
