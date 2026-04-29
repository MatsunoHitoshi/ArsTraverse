import type { CommunityAssignmentResult } from "../types";

export type NodeToCommunityRecord = Record<string, string>;

/** Map またはプレーンオブジェクトを Map に統一 */
export function toNodeToCommunityMap(
  m: Map<string, string> | NodeToCommunityRecord,
): Map<string, string> {
  if (m instanceof Map) return new Map(m);
  return new Map(Object.entries(m));
}

export interface CommunityAssignmentComparison {
  /** baseline と比較した共通ノード数 */
  comparedNodeCount: number;
  /** 共通ノードで communityId が文字列一致した割合 */
  exactAgreementRate: number;
  /** baseline 側の異なる communityId 数 */
  distinctCommunitiesBaseline: number;
  /** 比較対象側の異なる communityId 数 */
  distinctCommunitiesOther: number;
}

/**
 * ノード ID → communityId の 2 割当を比較する。
 * ノード集合の和集合ではなく、両方に存在するノードのみで一致率を計算する。
 */
export function compareNodeToCommunity(
  baseline: Map<string, string> | NodeToCommunityRecord,
  other: Map<string, string> | NodeToCommunityRecord,
): CommunityAssignmentComparison {
  const a = toNodeToCommunityMap(baseline);
  const b = toNodeToCommunityMap(other);
  const distinctA = new Set(a.values()).size;
  const distinctB = new Set(b.values()).size;

  let match = 0;
  let n = 0;
  for (const [nodeId, ca] of a) {
    const cb = b.get(nodeId);
    if (cb === undefined) continue;
    n++;
    if (ca === cb) match++;
  }

  return {
    comparedNodeCount: n,
    exactAgreementRate: n === 0 ? 1 : match / n,
    distinctCommunitiesBaseline: distinctA,
    distinctCommunitiesOther: distinctB,
  };
}

/** JSON 保存用に CommunityAssignmentResult をプレーンオブジェクトへ変換 */
export function serializeCommunityAssignmentResult(
  result: CommunityAssignmentResult,
): {
  nodeToCommunity: NodeToCommunityRecord;
  communityGroups: Record<string, string[]>;
  communityInternalEdges: Record<
    string,
    Array<{ sourceName: string; targetName: string; type: string }>
  >;
  communityExternalConnections: Record<
    string,
    Record<string, { count: number; types: string[] }>
  >;
} {
  const groups: Record<string, string[]> = {};
  for (const [k, v] of result.communityGroups) {
    groups[k] = v;
  }

  const ext: Record<string, Record<string, { count: number; types: string[] }>> =
    {};
  for (const [from, inner] of result.communityExternalConnections) {
    const bucket: Record<string, { count: number; types: string[] }> = {};
    ext[from] = bucket;
    for (const [to, data] of inner) {
      bucket[to] = {
        count: data.count,
        types: [...data.types],
      };
    }
  }

  return {
    nodeToCommunity: Object.fromEntries(result.nodeToCommunity),
    communityGroups: groups,
    communityInternalEdges: Object.fromEntries(
      result.communityInternalEdges,
    ),
    communityExternalConnections: ext,
  };
}
