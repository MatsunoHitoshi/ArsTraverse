import { mapNumericClustersSeedMaxCount } from "./section-map-seed-max";
import { mapNumericClustersHybridSeedEmbedding } from "./section-map-hybrid-embedding";
import type {
  ClusterStrategyContext,
  ClusterStrategySection,
  ClusterStrategyId,
  CommunityAssignmentResult,
  HybridSectionMappingContext,
  MetaGraphGraphDoc,
  MetaGraphStrategiesInput,
  SectionMapStrategyId,
} from "./types";
import { DEFAULT_META_GRAPH_STRATEGIES } from "./types";
import { runTopologyCluster } from "./cluster-strategies";

function aggregateEdges(
  graphDocument: MetaGraphGraphDoc,
  nodeClusterLabel: Record<string, number>,
  numericToSectionOrNonStory: Map<number, string>,
): CommunityAssignmentResult {
  const nodeToCommunity = new Map<string, string>();
  graphDocument.nodes.forEach((node) => {
    const num = nodeClusterLabel[node.id];
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

export interface RunCommunityAssignmentOptions {
  strategies?: MetaGraphStrategiesInput;
  hybridContext: HybridSectionMappingContext | null;
  /** 第1層（embedding-kmeans 等）用。未指定時は sections のみ */
  clusterStrategyContext?: Partial<ClusterStrategyContext>;
}

/**
 * 第1層（トポロジクラスタ）→ 第2層（数値クラスタ→text-i / louvain-*）→ エッジ集計。
 */
export function runCommunityAssignment(
  graphDocument: MetaGraphGraphDoc,
  sections: ClusterStrategySection[],
  options: RunCommunityAssignmentOptions,
): CommunityAssignmentResult {
  const { strategies, hybridContext, clusterStrategyContext } = options;

  const sectionMapStrategy: SectionMapStrategyId =
    strategies?.sectionMapStrategy ??
    DEFAULT_META_GRAPH_STRATEGIES.sectionMapStrategy;

  const clusterStrategy: ClusterStrategyId =
    strategies?.clusterStrategy ??
    DEFAULT_META_GRAPH_STRATEGIES.clusterStrategy;

  const clusterCtx: ClusterStrategyContext = {
    sections,
    nodeNameEmbeddings: clusterStrategyContext?.nodeNameEmbeddings,
    maxK:
      strategies?.clusterOptions?.maxK ?? clusterStrategyContext?.maxK,
    labelPropagationIterations:
      strategies?.clusterOptions?.labelPropagationIterations ??
      clusterStrategyContext?.labelPropagationIterations,
    randomSeed:
      strategies?.clusterOptions?.randomSeed ??
      clusterStrategyContext?.randomSeed,
  };

  const topology = runTopologyCluster(clusterStrategy, graphDocument, clusterCtx);

  const useHybrid =
    sectionMapStrategy === "hybrid-seed-embedding" && hybridContext !== null;

  const numericToSectionOrNonStory = useHybrid
    ? mapNumericClustersHybridSeedEmbedding(
        graphDocument,
        sections,
        topology.labelToNodeIds,
        hybridContext,
      )
    : mapNumericClustersSeedMaxCount(
        graphDocument,
        sections,
        topology.labelToNodeIds,
      );

  return aggregateEdges(
    graphDocument,
    topology.nodeClusterLabel,
    numericToSectionOrNonStory,
  );
}
