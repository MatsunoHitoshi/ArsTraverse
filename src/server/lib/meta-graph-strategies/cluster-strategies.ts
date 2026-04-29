import type {
  ClusterStrategyContext,
  ClusterStrategyId,
  MetaGraphGraphDoc,
  TopologyClusterResult,
} from "./types";
import { clusterLouvainUnweighted } from "./cluster-louvain-unweighted";
import { clusterLeidenUnweighted } from "./cluster-leiden-unweighted";
import { clusterEmbeddingKMeansName } from "./cluster-embedding-kmeans-name";
import { clusterLabelPropagationSeeded } from "./cluster-label-propagation-seeded";

export type ClusterStrategyFn = (
  graph: MetaGraphGraphDoc,
  ctx: ClusterStrategyContext,
) => TopologyClusterResult;

const clusterStrategies: Record<ClusterStrategyId, ClusterStrategyFn> = {
  "louvain-unweighted": (graph, _ctx) => clusterLouvainUnweighted(graph),
  "leiden-unweighted": (graph, ctx) =>
    clusterLeidenUnweighted(graph, ctx.randomSeed ?? 42),
  "embedding-kmeans-name": (graph, ctx) =>
    clusterEmbeddingKMeansName(graph, ctx),
  "label-propagation-seeded": (graph, ctx) =>
    clusterLabelPropagationSeeded(graph, ctx),
};

export function runTopologyCluster(
  strategyId: ClusterStrategyId,
  graph: MetaGraphGraphDoc,
  ctx: ClusterStrategyContext,
): TopologyClusterResult {
  const fn = clusterStrategies[strategyId];
  return fn(graph, ctx);
}
