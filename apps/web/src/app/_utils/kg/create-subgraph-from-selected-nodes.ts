import type { GraphDocumentForFrontend } from "@/app/const/types";

export const createSubgraphFromSelectedNodes = (
  fullGraph: GraphDocumentForFrontend,
  selectedNodeIds: string[],
): GraphDocumentForFrontend => {
  const nodeIdSet = new Set(selectedNodeIds);
  const nodes = fullGraph.nodes.filter((n) => nodeIdSet.has(n.id));
  const relationships = fullGraph.relationships.filter(
    (r) => nodeIdSet.has(r.sourceId) && nodeIdSet.has(r.targetId),
  );
  return { nodes, relationships };
};
