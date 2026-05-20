import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import { findDuplicateEdgeGroups } from "@/app/_utils/kg/find-duplicate-edge-groups";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { loadDraftEditableProposal } from "@/server/repositories/graph-edit-proposal.repository";
import {
  type DraftGraphData,
  reconstructDraftGraphData,
  overwriteProposalChangesFromDraft,
} from "./draft.service";
import { resolveDraftEntityProperties } from "./resolve-draft-entity-properties";

function relationshipEndpointKey(rel: RelationshipTypeForFrontend): string {
  return `${rel.type}\0${rel.sourceId}\0${rel.targetId}`;
}

export function mergeNodesInDraftGraph(
  draftGraphData: DraftGraphData,
  input: {
    canonicalNodeId: string;
    duplicateNodeIds: string[];
    canonicalName?: string;
    canonicalLabel?: string;
    canonicalProperties?: Record<string, string>;
  },
) {
  const duplicateIdSet = new Set(
    input.duplicateNodeIds.filter((id) => id !== input.canonicalNodeId),
  );

  const nodeMap = new Map(
    draftGraphData.nodes.map((n) => [n.id, n] as const),
  );

  const canonicalNode = nodeMap.get(input.canonicalNodeId);
  if (!canonicalNode) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "指定された正規ノードがドラフトに存在しません",
    });
  }

  const skippedDuplicateNodeIds: string[] = [];
  for (const duplicateId of duplicateIdSet) {
    if (!nodeMap.has(duplicateId)) {
      skippedDuplicateNodeIds.push(duplicateId);
      duplicateIdSet.delete(duplicateId);
    }
  }

  if (duplicateIdSet.size === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "統合対象の重複ノードがドラフトに存在しません",
    });
  }

  const normalizedCanonicalProperties =
    input.canonicalProperties !== undefined
      ? Object.fromEntries(
          Object.entries(input.canonicalProperties).map(([k, v]) => [
            k,
            String(v),
          ]),
        )
      : canonicalNode.properties;

  nodeMap.set(input.canonicalNodeId, {
    ...canonicalNode,
    name: input.canonicalName ?? canonicalNode.name,
    label: input.canonicalLabel ?? canonicalNode.label,
    properties: normalizedCanonicalProperties,
  });

  let rewiredEdgeCount = 0;
  const remappedRelationships = draftGraphData.relationships
    .map((rel) => {
      const sourceIsDuplicate = duplicateIdSet.has(rel.sourceId);
      const targetIsDuplicate = duplicateIdSet.has(rel.targetId);

      if (sourceIsDuplicate && targetIsDuplicate) {
        return null;
      }

      const nextSourceId = sourceIsDuplicate
        ? input.canonicalNodeId
        : rel.sourceId;
      const nextTargetId = targetIsDuplicate
        ? input.canonicalNodeId
        : rel.targetId;

      if (
        nextSourceId === rel.sourceId &&
        nextTargetId === rel.targetId
      ) {
        return rel;
      }

      rewiredEdgeCount++;

      return {
        ...rel,
        sourceId: nextSourceId,
        targetId: nextTargetId,
      };
    })
    .filter((rel): rel is RelationshipTypeForFrontend => rel !== null);

  const seenRelationshipKeys = new Set<string>();
  const deduplicatedRelationships: RelationshipTypeForFrontend[] = [];
  let deduplicatedEdgeCount = 0;

  for (const rel of remappedRelationships) {
    const key = relationshipEndpointKey(rel);
    if (seenRelationshipKeys.has(key)) {
      deduplicatedEdgeCount++;
      continue;
    }
    seenRelationshipKeys.add(key);
    deduplicatedRelationships.push(rel);
  }

  for (const duplicateId of duplicateIdSet) {
    nodeMap.delete(duplicateId);
  }

  const nextDraftGraphData: DraftGraphData = {
    nodes: Array.from(nodeMap.values()),
    relationships: deduplicatedRelationships.filter(
      (r) => nodeMap.has(r.sourceId) && nodeMap.has(r.targetId),
    ),
  };

  return {
    nextDraftGraphData,
    removedDuplicateNodeCount: duplicateIdSet.size,
    rewiredEdgeCount,
    deduplicatedEdgeCount,
    skippedDuplicateNodeIds,
  };
}

async function commitDraftGraphUpdate(
  db: PrismaClient,
  userId: string,
  proposalId: string,
  buildNext: (draft: DraftGraphData) => DraftGraphData,
) {
  const { proposal, baseGraphData } = await loadDraftEditableProposal(
    db,
    proposalId,
    userId,
  );
  const draftGraphData = reconstructDraftGraphData(
    baseGraphData,
    proposal.changes,
  );
  const nextDraftGraphData = buildNext(draftGraphData);
  await overwriteProposalChangesFromDraft(
    db,
    proposalId,
    baseGraphData,
    nextDraftGraphData,
  );
  return { proposalId };
}

export async function upsertNodeInDraft(
  db: PrismaClient,
  userId: string,
  input: {
    proposalId: string;
    node: {
      id: string;
      name: string;
      label: string;
      properties?: Record<string, string | number | boolean | null>;
    };
  },
) {
  return commitDraftGraphUpdate(db, userId, input.proposalId, (draft) => {
    const nodeMap = new Map(draft.nodes.map((n) => [n.id, n] as const));
    const existing = nodeMap.get(input.node.id);
    const normalizedProperties = resolveDraftEntityProperties(
      existing?.properties,
      input.node.properties,
    );
    nodeMap.set(input.node.id, {
      id: input.node.id,
      name: input.node.name,
      label: input.node.label,
      properties: normalizedProperties,
    });
    return {
      nodes: Array.from(nodeMap.values()),
      relationships: draft.relationships.filter(
        (r) => nodeMap.has(r.sourceId) && nodeMap.has(r.targetId),
      ),
    };
  });
}

export async function deleteNodeInDraft(
  db: PrismaClient,
  userId: string,
  input: { proposalId: string; nodeId: string },
) {
  return commitDraftGraphUpdate(db, userId, input.proposalId, (draft) => {
    const nodeMap = new Map(draft.nodes.map((n) => [n.id, n] as const));
    const relMap = new Map(draft.relationships.map((r) => [r.id, r] as const));
    if (!nodeMap.has(input.nodeId)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "指定されたノードがドラフトに存在しません",
      });
    }
    nodeMap.delete(input.nodeId);
    for (const [relId, rel] of Array.from(relMap.entries())) {
      if (rel.sourceId === input.nodeId || rel.targetId === input.nodeId) {
        relMap.delete(relId);
      }
    }
    return {
      nodes: Array.from(nodeMap.values()),
      relationships: Array.from(relMap.values()),
    };
  });
}

export async function setNodePropertyInDraft(
  db: PrismaClient,
  userId: string,
  input: {
    proposalId: string;
    nodeId: string;
    key: string;
    value: string | number | boolean | null;
  },
) {
  return commitDraftGraphUpdate(db, userId, input.proposalId, (draft) => {
    const nodeMap = new Map(draft.nodes.map((n) => [n.id, n] as const));
    const node = nodeMap.get(input.nodeId);
    if (!node) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "指定されたノードがドラフトに存在しません",
      });
    }
    nodeMap.set(input.nodeId, {
      ...node,
      properties: { ...node.properties, [input.key]: String(input.value) },
    });
    return {
      nodes: Array.from(nodeMap.values()),
      relationships: draft.relationships.filter(
        (r) => nodeMap.has(r.sourceId) && nodeMap.has(r.targetId),
      ),
    };
  });
}

export async function unsetNodePropertyInDraft(
  db: PrismaClient,
  userId: string,
  input: { proposalId: string; nodeId: string; key: string },
) {
  return commitDraftGraphUpdate(db, userId, input.proposalId, (draft) => {
    const nodeMap = new Map(draft.nodes.map((n) => [n.id, n] as const));
    const node = nodeMap.get(input.nodeId);
    if (!node) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "指定されたノードがドラフトに存在しません",
      });
    }
    const nextProperties = { ...node.properties };
    delete nextProperties[input.key];
    nodeMap.set(input.nodeId, { ...node, properties: nextProperties });
    return {
      nodes: Array.from(nodeMap.values()),
      relationships: draft.relationships.filter(
        (r) => nodeMap.has(r.sourceId) && nodeMap.has(r.targetId),
      ),
    };
  });
}

export async function upsertRelationshipInDraft(
  db: PrismaClient,
  userId: string,
  input: {
    proposalId: string;
    relationship: {
      id: string;
      type: string;
      sourceId: string;
      targetId: string;
      properties?: Record<string, string | number | boolean | null>;
    };
  },
) {
  return commitDraftGraphUpdate(db, userId, input.proposalId, (draft) => {
    const nodeMap = new Map(draft.nodes.map((n) => [n.id, n] as const));
    const relMap = new Map(draft.relationships.map((r) => [r.id, r] as const));
    const { relationship } = input;
    if (
      !nodeMap.has(relationship.sourceId) ||
      !nodeMap.has(relationship.targetId)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "エッジの両端ノードがドラフトに存在しません",
      });
    }
    const existing = relMap.get(relationship.id);
    const normalizedProperties = resolveDraftEntityProperties(
      existing?.properties,
      relationship.properties,
    );
    relMap.set(relationship.id, {
      id: relationship.id,
      type: relationship.type,
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
      properties: normalizedProperties,
    });
    return {
      nodes: Array.from(nodeMap.values()),
      relationships: Array.from(relMap.values()).filter(
        (r) => nodeMap.has(r.sourceId) && nodeMap.has(r.targetId),
      ),
    };
  });
}

export async function deleteRelationshipInDraft(
  db: PrismaClient,
  userId: string,
  input: { proposalId: string; relationshipId: string },
) {
  return commitDraftGraphUpdate(db, userId, input.proposalId, (draft) => {
    const relMap = new Map(draft.relationships.map((r) => [r.id, r] as const));
    if (!relMap.has(input.relationshipId)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "指定されたエッジがドラフトに存在しません",
      });
    }
    relMap.delete(input.relationshipId);
    return {
      nodes: draft.nodes,
      relationships: Array.from(relMap.values()),
    };
  });
}

export async function setRelationshipPropertyInDraft(
  db: PrismaClient,
  userId: string,
  input: {
    proposalId: string;
    relationshipId: string;
    key: string;
    value: string | number | boolean | null;
  },
) {
  return commitDraftGraphUpdate(db, userId, input.proposalId, (draft) => {
    const relMap = new Map(draft.relationships.map((r) => [r.id, r] as const));
    const rel = relMap.get(input.relationshipId);
    if (!rel) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "指定されたエッジがドラフトに存在しません",
      });
    }
    relMap.set(input.relationshipId, {
      ...rel,
      properties: { ...rel.properties, [input.key]: String(input.value) },
    });
    return {
      nodes: draft.nodes,
      relationships: Array.from(relMap.values()),
    };
  });
}

export async function unsetRelationshipPropertyInDraft(
  db: PrismaClient,
  userId: string,
  input: { proposalId: string; relationshipId: string; key: string },
) {
  return commitDraftGraphUpdate(db, userId, input.proposalId, (draft) => {
    const relMap = new Map(draft.relationships.map((r) => [r.id, r] as const));
    const rel = relMap.get(input.relationshipId);
    if (!rel) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "指定されたエッジがドラフトに存在しません",
      });
    }
    const nextProperties = { ...rel.properties };
    delete nextProperties[input.key];
    relMap.set(input.relationshipId, { ...rel, properties: nextProperties });
    return {
      nodes: draft.nodes,
      relationships: Array.from(relMap.values()),
    };
  });
}

export async function mergeNodesInDraft(
  db: PrismaClient,
  userId: string,
  input: {
    proposalId: string;
    canonicalNodeId: string;
    duplicateNodeIds: string[];
    canonicalName?: string;
    canonicalLabel?: string;
    canonicalProperties?: Record<string, string>;
  },
) {
  const { proposal, baseGraphData } = await loadDraftEditableProposal(
    db,
    input.proposalId,
    userId,
  );
  const draftGraphData = reconstructDraftGraphData(
    baseGraphData,
    proposal.changes,
  );
  const result = mergeNodesInDraftGraph(draftGraphData, input);
  await overwriteProposalChangesFromDraft(
    db,
    input.proposalId,
    baseGraphData,
    result.nextDraftGraphData,
  );
  return {
    proposalId: input.proposalId,
    removedDuplicateNodeCount: result.removedDuplicateNodeCount,
    rewiredEdgeCount: result.rewiredEdgeCount,
    deduplicatedEdgeCount: result.deduplicatedEdgeCount,
    skippedDuplicateNodeIds: result.skippedDuplicateNodeIds,
  };
}

export async function deduplicateEdgesInDraft(
  db: PrismaClient,
  userId: string,
  input: {
    proposalId: string;
    edgeGroups?: Array<{
      keepEdgeId: string;
      removeEdgeIds: string[];
    }>;
  },
) {
  const { proposal, baseGraphData } = await loadDraftEditableProposal(
    db,
    input.proposalId,
    userId,
  );

  const draftGraphData = reconstructDraftGraphData(
    baseGraphData,
    proposal.changes,
  );

  const relMap = new Map(
    draftGraphData.relationships.map((r) => [r.id, r] as const),
  );

  const removeIds = new Set<string>();

  if (input.edgeGroups && input.edgeGroups.length > 0) {
    for (const group of input.edgeGroups) {
      if (!relMap.has(group.keepEdgeId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `保持するエッジがドラフトに存在しません: ${group.keepEdgeId}`,
        });
      }
      for (const removeId of group.removeEdgeIds) {
        if (removeId === group.keepEdgeId) continue;
        if (relMap.has(removeId)) {
          removeIds.add(removeId);
        }
      }
    }
  } else {
    const duplicateGroups = findDuplicateEdgeGroups(
      draftGraphData.relationships.map((r) => ({
        id: r.id,
        type: r.type,
        sourceId: r.sourceId,
        targetId: r.targetId,
      })),
    );
    for (const group of duplicateGroups) {
      const [, ...duplicates] = group.edges;
      for (const edge of duplicates) {
        removeIds.add(edge.id);
      }
    }
  }

  for (const removeId of removeIds) {
    relMap.delete(removeId);
  }

  const nextDraftGraphData: DraftGraphData = {
    nodes: draftGraphData.nodes,
    relationships: Array.from(relMap.values()),
  };

  await overwriteProposalChangesFromDraft(
    db,
    input.proposalId,
    baseGraphData,
    nextDraftGraphData,
  );

  return {
    proposalId: input.proposalId,
    removedEdgeCount: removeIds.size,
  };
}

export async function getProposalDraftGraph(
  db: PrismaClient,
  userId: string,
  proposalId: string,
) {
  const { proposal, baseGraphData } = await loadDraftEditableProposal(
    db,
    proposalId,
    userId,
  );
  const draftGraph = reconstructDraftGraphData(
    baseGraphData,
    proposal.changes,
  );
  return {
    proposal: { id: proposal.id, status: proposal.status },
    draftGraph,
  };
}

export async function getProposalDraftDiff(
  db: PrismaClient,
  userId: string,
  proposalId: string,
) {
  const {
    buildNodeNameMap,
    formatNodeDiffsForReview,
    formatRelationshipDiffsForReview,
    summarizeDiffCounts,
  } = await import("./draft-review-format");

  const { proposal, baseGraphData } = await loadDraftEditableProposal(
    db,
    proposalId,
    userId,
  );
  const draftGraphData = reconstructDraftGraphData(
    baseGraphData,
    proposal.changes,
  );
  const nodeDiffs = diffNodes(baseGraphData.nodes, draftGraphData.nodes);
  const relationshipDiffs = diffRelationships(
    baseGraphData.relationships,
    draftGraphData.relationships,
  );
  const nameById = buildNodeNameMap([baseGraphData, draftGraphData]);
  return {
    proposal: {
      id: proposal.id,
      title: proposal.title,
      status: proposal.status,
      description: proposal.description,
    },
    summary: summarizeDiffCounts(nodeDiffs, relationshipDiffs),
    nodeChanges: formatNodeDiffsForReview(nodeDiffs),
    edgeChanges: formatRelationshipDiffsForReview(
      relationshipDiffs,
      nameById,
    ),
    hasChanges: nodeDiffs.length + relationshipDiffs.length > 0,
  };
}
