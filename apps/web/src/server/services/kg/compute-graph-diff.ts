import type { GraphNode, GraphRelationship } from "@prisma/client";
import { diffNodes, diffRelationships } from "@/app/_utils/kg/diff";
import {
  formGraphDataForFrontend,
  formNodeDataForFrontend,
  formRelationshipDataForFrontend,
} from "@/app/_utils/kg/frontend-properties";
import {
  generateGraphChangeData,
  graphChangeDataFromDiffs,
} from "@/server/domain/kg/graph-change-data";

export function computeTopicSpaceGraphDiff(
  prevNodes: GraphNode[],
  prevRelationships: GraphRelationship[],
  nextNodes: GraphNode[],
  nextRelationships: GraphRelationship[],
) {
  const prevFrontend = formGraphDataForFrontend({
    nodes: prevNodes,
    relationships: prevRelationships,
  });
  const nextFrontend = formGraphDataForFrontend({
    nodes: nextNodes,
    relationships: nextRelationships,
  });

  const nodeDiffs = diffNodes(prevFrontend.nodes, nextFrontend.nodes);
  const relationshipDiffs = diffRelationships(
    prevFrontend.relationships,
    nextFrontend.relationships,
  );

  const changeData = graphChangeDataFromDiffs(nodeDiffs, relationshipDiffs);

  return { nodeDiffs, relationshipDiffs, changeData, nextFrontend };
}

export function computeTopicSpaceGraphDiffFromFrontend(
  prevNodes: GraphNode[],
  prevRelationships: GraphRelationship[],
  nextNodes: ReturnType<typeof formNodeDataForFrontend>[],
  nextRelationships: ReturnType<typeof formRelationshipDataForFrontend>[],
) {
  const prevFrontend = {
    nodes: prevNodes.map((n) => formNodeDataForFrontend(n)),
    relationships: prevRelationships.map((r) =>
      formRelationshipDataForFrontend(r),
    ),
  };

  const nodeDiffs = diffNodes(prevFrontend.nodes, nextNodes);
  const relationshipDiffs = diffRelationships(
    prevFrontend.relationships,
    nextRelationships,
  );

  const changeData = generateGraphChangeData(
    prevFrontend.nodes,
    prevFrontend.relationships,
    nextNodes,
    nextRelationships,
  );

  return { nodeDiffs, relationshipDiffs, changeData };
}
