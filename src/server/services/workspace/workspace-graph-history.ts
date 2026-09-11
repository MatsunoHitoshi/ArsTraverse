export type WorkspaceGraphNodeChange = {
  change: "added" | "removed" | "updated";
  id: string;
  name: string;
  label: string;
  previousName?: string;
  previousLabel?: string;
};

export type WorkspaceGraphRelationshipChange = {
  change: "added" | "removed" | "updated";
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  previousType?: string;
};

export type WorkspaceGraphDiff = {
  nodes: WorkspaceGraphNodeChange[];
  relationships: WorkspaceGraphRelationshipChange[];
  summary: {
    addedNodeCount: number;
    removedNodeCount: number;
    updatedNodeCount: number;
    addedRelationshipCount: number;
    removedRelationshipCount: number;
    updatedRelationshipCount: number;
    metaChanged: boolean;
  };
};

type GraphRecord = Record<string, unknown>;

function isRecord(value: unknown): value is GraphRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readLiveGraphFromCuratorialContext(
  context: unknown,
): unknown {
  if (!isRecord(context)) return null;
  if (isRecord(context.sosWriting) && "liveGraph" in context.sosWriting) {
    return context.sosWriting.liveGraph ?? null;
  }
  if (isRecord(context.sosConcept) && "liveGraph" in context.sosConcept) {
    return context.sosConcept.liveGraph ?? null;
  }
  return context.liveGraph ?? null;
}

export function withLiveGraphInCuratorialContext(
  context: unknown,
  graph: unknown,
): GraphRecord {
  const base = isRecord(context) ? { ...context } : {};
  if (isRecord(base.sosWriting)) {
    base.sosWriting = { ...base.sosWriting, liveGraph: graph };
    return base;
  }
  if (isRecord(base.sosConcept)) {
    base.sosConcept = { ...base.sosConcept, liveGraph: graph };
    return base;
  }
  base.liveGraph = graph;
  return base;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value ?? null;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function omitGraphKeys(graph: GraphRecord, keys: string[]): GraphRecord {
  const next: GraphRecord = {};
  for (const [key, value] of Object.entries(graph)) {
    if (keys.includes(key)) continue;
    next[key] = value;
  }
  return next;
}

function graphForCompare(graph: unknown): unknown {
  if (!isRecord(graph)) return null;
  return omitGraphKeys(graph, ["updatedAt"]);
}

export function liveGraphsEqual(left: unknown, right: unknown): boolean {
  return stableJson(graphForCompare(left)) === stableJson(graphForCompare(right));
}

function asEntityList(
  graph: unknown,
  key: "nodes" | "relationships",
): Array<GraphRecord & { id: string }> {
  if (!isRecord(graph) || !Array.isArray(graph[key])) return [];
  return graph[key].filter(
    (item): item is GraphRecord & { id: string } =>
      isRecord(item) && typeof item.id === "string",
  );
}

function entitySignature(entity: GraphRecord, omit: string[]): unknown {
  const next: GraphRecord = {};
  for (const [key, value] of Object.entries(entity)) {
    if (omit.includes(key)) continue;
    next[key] = value;
  }
  return sortValue(next);
}

function nodeName(entity: GraphRecord & { id: string }): string {
  return typeof entity.name === "string" && entity.name.trim()
    ? entity.name
    : entity.id;
}

function nodeLabel(entity: GraphRecord): string {
  return typeof entity.label === "string" ? entity.label : "";
}

function relationshipType(entity: GraphRecord): string {
  return typeof entity.type === "string" ? entity.type : "";
}

function relationshipEnd(
  entity: GraphRecord,
  key: "sourceId" | "targetId",
): string {
  const value = entity[key];
  return typeof value === "string" ? value : "";
}

function nameIndex(
  entities: Array<GraphRecord & { id: string }>,
): Map<string, string> {
  return new Map(entities.map((entity) => [entity.id, nodeName(entity)]));
}

function lookupName(index: Map<string, string>, id: string): string {
  return index.get(id) ?? id;
}

function metaForCompare(graph: unknown): unknown {
  if (!isRecord(graph)) return null;
  return omitGraphKeys(graph, ["updatedAt", "nodes", "relationships"]);
}

export function diffLiveGraphs(
  previous: unknown,
  current: unknown,
): WorkspaceGraphDiff {
  const previousNodes = asEntityList(previous, "nodes");
  const currentNodes = asEntityList(current, "nodes");
  const previousRels = asEntityList(previous, "relationships");
  const currentRels = asEntityList(current, "relationships");
  const previousNames = nameIndex(previousNodes);
  const currentNames = nameIndex(currentNodes);

  const previousNodeMap = new Map(previousNodes.map((node) => [node.id, node]));
  const currentNodeMap = new Map(currentNodes.map((node) => [node.id, node]));
  const nodes: WorkspaceGraphNodeChange[] = [];

  for (const node of currentNodes) {
    const before = previousNodeMap.get(node.id);
    if (!before) {
      nodes.push({
        change: "added",
        id: node.id,
        name: nodeName(node),
        label: nodeLabel(node),
      });
      continue;
    }
    if (
      stableJson(entitySignature(before, ["id"])) !==
      stableJson(entitySignature(node, ["id"]))
    ) {
      nodes.push({
        change: "updated",
        id: node.id,
        name: nodeName(node),
        label: nodeLabel(node),
        previousName: nodeName(before),
        previousLabel: nodeLabel(before),
      });
    }
  }
  for (const node of previousNodes) {
    if (currentNodeMap.has(node.id)) continue;
    nodes.push({
      change: "removed",
      id: node.id,
      name: nodeName(node),
      label: nodeLabel(node),
    });
  }

  const previousRelMap = new Map(previousRels.map((rel) => [rel.id, rel]));
  const currentRelMap = new Map(currentRels.map((rel) => [rel.id, rel]));
  const relationships: WorkspaceGraphRelationshipChange[] = [];

  for (const rel of currentRels) {
    const sourceId = relationshipEnd(rel, "sourceId");
    const targetId = relationshipEnd(rel, "targetId");
    const before = previousRelMap.get(rel.id);
    if (!before) {
      relationships.push({
        change: "added",
        id: rel.id,
        type: relationshipType(rel),
        sourceId,
        targetId,
        sourceName: lookupName(currentNames, sourceId),
        targetName: lookupName(currentNames, targetId),
      });
      continue;
    }
    if (
      stableJson(entitySignature(before, ["id"])) !==
      stableJson(entitySignature(rel, ["id"]))
    ) {
      relationships.push({
        change: "updated",
        id: rel.id,
        type: relationshipType(rel),
        sourceId,
        targetId,
        sourceName: lookupName(currentNames, sourceId),
        targetName: lookupName(currentNames, targetId),
        previousType: relationshipType(before),
      });
    }
  }
  for (const rel of previousRels) {
    if (currentRelMap.has(rel.id)) continue;
    const sourceId = relationshipEnd(rel, "sourceId");
    const targetId = relationshipEnd(rel, "targetId");
    relationships.push({
      change: "removed",
      id: rel.id,
      type: relationshipType(rel),
      sourceId,
      targetId,
      sourceName: lookupName(previousNames, sourceId),
      targetName: lookupName(previousNames, targetId),
    });
  }

  const summary = {
    addedNodeCount: nodes.filter((item) => item.change === "added").length,
    removedNodeCount: nodes.filter((item) => item.change === "removed").length,
    updatedNodeCount: nodes.filter((item) => item.change === "updated").length,
    addedRelationshipCount: relationships.filter(
      (item) => item.change === "added",
    ).length,
    removedRelationshipCount: relationships.filter(
      (item) => item.change === "removed",
    ).length,
    updatedRelationshipCount: relationships.filter(
      (item) => item.change === "updated",
    ).length,
    metaChanged:
      stableJson(metaForCompare(previous)) !==
      stableJson(metaForCompare(current)),
  };

  return { nodes, relationships, summary };
}

export function summarizeWorkspaceGraphDiff(diff: WorkspaceGraphDiff): string {
  const parts: string[] = [];
  if (diff.summary.addedNodeCount > 0) {
    parts.push(`+${diff.summary.addedNodeCount}ノード`);
  }
  if (diff.summary.removedNodeCount > 0) {
    parts.push(`−${diff.summary.removedNodeCount}ノード`);
  }
  if (diff.summary.updatedNodeCount > 0) {
    parts.push(`${diff.summary.updatedNodeCount}ノード変更`);
  }
  if (diff.summary.addedRelationshipCount > 0) {
    parts.push(`+${diff.summary.addedRelationshipCount}関係`);
  }
  if (diff.summary.removedRelationshipCount > 0) {
    parts.push(`−${diff.summary.removedRelationshipCount}関係`);
  }
  if (diff.summary.updatedRelationshipCount > 0) {
    parts.push(`${diff.summary.updatedRelationshipCount}関係変更`);
  }
  if (parts.length === 0 && diff.summary.metaChanged) {
    return "抽出の紐付けを更新";
  }
  return parts.join(" · ");
}

export function graphDiffHasChanges(diff: WorkspaceGraphDiff): boolean {
  return (
    diff.nodes.length > 0 ||
    diff.relationships.length > 0 ||
    diff.summary.metaChanged
  );
}

export function defaultWritingHistoryDescription(input: {
  contentChanged: boolean;
  graphChanged: boolean;
}): string {
  if (input.contentChanged && input.graphChanged) {
    return "本文とグラフを更新しました";
  }
  if (input.graphChanged) return "グラフを更新しました";
  return "内容を更新しました";
}
