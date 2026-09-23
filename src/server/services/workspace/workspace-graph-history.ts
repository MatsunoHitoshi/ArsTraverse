export type WorkspaceGraphNodeChange = {
  change: "added" | "removed" | "updated" | "property";
  id: string;
  name: string;
  label: string;
  previousName?: string;
  previousLabel?: string;
};

export type WorkspaceGraphRelationshipChange = {
  change: "added" | "removed" | "updated" | "property";
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
    propertyChangeCount: number;
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

type PropertyChangeKind = "updated" | "property";

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

/** 名前以外（種類と properties）だけが変わったノードは property。 */
function nodeDiffKind(
  before: GraphRecord & { id: string },
  node: GraphRecord & { id: string },
): PropertyChangeKind | null {
  if (sameJson(entitySignature(before, ["id"]), entitySignature(node, ["id"]))) {
    return null;
  }
  const nameSame = nodeName(before) === nodeName(node);
  const restSame = sameJson(
    entitySignature(before, ["id", "name", "label", "properties"]),
    entitySignature(node, ["id", "name", "label", "properties"]),
  );
  if (nameSame && restSame) return "property";
  return "updated";
}

/** タイプと端点以外（properties）だけが変わったエッジは property。 */
function relationshipDiffKind(
  before: GraphRecord & { id: string },
  rel: GraphRecord & { id: string },
): PropertyChangeKind | null {
  if (sameJson(entitySignature(before, ["id"]), entitySignature(rel, ["id"]))) {
    return null;
  }
  const structuralSame =
    relationshipType(before) === relationshipType(rel) &&
    relationshipEnd(before, "sourceId") === relationshipEnd(rel, "sourceId") &&
    relationshipEnd(before, "targetId") === relationshipEnd(rel, "targetId");
  const restSame = sameJson(
    entitySignature(before, ["id", "type", "sourceId", "targetId", "properties"]),
    entitySignature(rel, ["id", "type", "sourceId", "targetId", "properties"]),
  );
  if (structuralSame && restSame) return "property";
  return "updated";
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
    const kind = nodeDiffKind(before, node);
    if (kind) {
      const previousName = nodeName(before);
      const previousLabel = nodeLabel(before);
      nodes.push({
        change: kind,
        id: node.id,
        name: nodeName(node),
        label: nodeLabel(node),
        previousName:
          previousName !== nodeName(node) ? previousName : undefined,
        previousLabel:
          previousLabel !== nodeLabel(node) ? previousLabel : undefined,
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
    const kind = relationshipDiffKind(before, rel);
    if (kind) {
      const beforeType = relationshipType(before);
      const nextType = relationshipType(rel);
      relationships.push({
        change: kind,
        id: rel.id,
        type: nextType,
        sourceId,
        targetId,
        sourceName: lookupName(currentNames, sourceId),
        targetName: lookupName(currentNames, targetId),
        previousType: beforeType !== nextType ? beforeType : undefined,
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
    propertyChangeCount:
      nodes.filter((item) => item.change === "property").length +
      relationships.filter((item) => item.change === "property").length,
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
  if (diff.summary.propertyChangeCount > 0) {
    parts.push(`${diff.summary.propertyChangeCount}件のプロパティ変更`);
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

export type GraphEventOrigin = "sketch" | "manual" | "llm" | "unknown";

export type GraphEventChange =
  | "added"
  | "removed"
  | "updated"
  | "promoted"
  | "property";

export type WorkspaceGraphEvent = {
  kind: "node" | "relationship";
  change: GraphEventChange;
  origin: GraphEventOrigin;
  id: string;
  name?: string;
  label?: string;
  previousLabel?: string;
  previousName?: string;
  type?: string;
  previousType?: string;
  sourceId?: string;
  targetId?: string;
  sourceName?: string;
  targetName?: string;
};

const SKETCH_GRAPH_EDIT = "sketch";
/** sos-research の手入力は properties.graphEdit に "added" を残す。 */
const MANUAL_GRAPH_EDIT = "added";

function graphEditOf(entity: GraphRecord): string | null {
  if (!isRecord(entity.properties)) return null;
  return typeof entity.properties.graphEdit === "string"
    ? entity.properties.graphEdit
    : null;
}

function editIdSet(
  graph: unknown,
  group: "sketches" | "added",
  kind: "node" | "relationship",
): Set<string> {
  const ids = new Set<string>();
  if (!isRecord(graph) || !isRecord(graph.edits)) return ids;
  const idKey = kind === "node" ? "nodeId" : "relationshipId";
  let list: unknown;
  if (group === "sketches") {
    if (!isRecord(graph.edits.sketches)) return ids;
    list =
      kind === "node"
        ? graph.edits.sketches.nodes
        : graph.edits.sketches.relationships;
  } else {
    list =
      kind === "node"
        ? graph.edits.addedNodes
        : graph.edits.addedRelationships;
  }
  if (!Array.isArray(list)) return ids;
  for (const item of list) {
    if (isRecord(item) && typeof item[idKey] === "string") {
      ids.add(item[idKey]);
    }
  }
  return ids;
}

function hasBlockEvidence(
  graph: unknown,
  kind: "node" | "relationship",
  id: string,
): boolean {
  if (!isRecord(graph)) return false;
  if (isRecord(graph.provenance)) {
    const rows =
      kind === "node" ? graph.provenance.nodes : graph.provenance.relationships;
    const idKey = kind === "node" ? "nodeId" : "relationshipId";
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (!isRecord(row) || row[idKey] !== id) continue;
        if (
          Array.isArray(row.blockIds) &&
          row.blockIds.some((blockId) => typeof blockId === "string" && blockId)
        ) {
          return true;
        }
      }
    }
  }
  if (!isRecord(graph.blockExtractions)) return false;
  const field = kind === "node" ? "nodeIds" : "relationshipIds";
  for (const extraction of Object.values(graph.blockExtractions)) {
    if (!isRecord(extraction) || !Array.isArray(extraction[field])) continue;
    if (extraction[field].includes(id)) return true;
  }
  return false;
}

function isSketchEntity(
  entity: GraphRecord & { id: string },
  graph: unknown,
  kind: "node" | "relationship",
): boolean {
  return (
    graphEditOf(entity) === SKETCH_GRAPH_EDIT ||
    editIdSet(graph, "sketches", kind).has(entity.id)
  );
}

function originOf(
  entity: GraphRecord & { id: string },
  graph: unknown,
  kind: "node" | "relationship",
): GraphEventOrigin {
  if (isSketchEntity(entity, graph, kind)) return "sketch";
  if (
    graphEditOf(entity) === MANUAL_GRAPH_EDIT ||
    editIdSet(graph, "added", kind).has(entity.id)
  ) {
    return "manual";
  }
  if (hasBlockEvidence(graph, kind, entity.id)) return "llm";
  return "unknown";
}

export function classifyGraphEvents(
  previous: unknown,
  current: unknown,
): WorkspaceGraphEvent[] {
  const previousNodes = asEntityList(previous, "nodes");
  const currentNodes = asEntityList(current, "nodes");
  const previousRels = asEntityList(previous, "relationships");
  const currentRels = asEntityList(current, "relationships");
  const previousNames = nameIndex(previousNodes);
  const currentNames = nameIndex(currentNodes);
  const previousNodeMap = new Map(previousNodes.map((node) => [node.id, node]));
  const currentNodeMap = new Map(currentNodes.map((node) => [node.id, node]));
  const events: WorkspaceGraphEvent[] = [];

  for (const node of currentNodes) {
    const before = previousNodeMap.get(node.id);
    if (!before) {
      events.push({
        kind: "node",
        change: "added",
        origin: originOf(node, current, "node"),
        id: node.id,
        name: nodeName(node),
        label: nodeLabel(node),
      });
      continue;
    }
    const promoted =
      isSketchEntity(before, previous, "node") &&
      !isSketchEntity(node, current, "node") &&
      hasBlockEvidence(current, "node", node.id);
    const kind = nodeDiffKind(before, node);
    if (!promoted && !kind) continue;
    const previousLabel = nodeLabel(before);
    const nextLabel = nodeLabel(node);
    events.push({
      kind: "node",
      change: promoted ? "promoted" : kind!,
      origin: promoted ? "sketch" : originOf(node, current, "node"),
      id: node.id,
      name: nodeName(node),
      label: nextLabel,
      previousLabel: previousLabel !== nextLabel ? previousLabel : undefined,
      previousName:
        nodeName(before) !== nodeName(node) ? nodeName(before) : undefined,
    });
  }
  for (const node of previousNodes) {
    if (currentNodeMap.has(node.id)) continue;
    events.push({
      kind: "node",
      change: "removed",
      origin: originOf(node, previous, "node"),
      id: node.id,
      name: nodeName(node),
      label: nodeLabel(node),
    });
  }

  const previousRelMap = new Map(previousRels.map((rel) => [rel.id, rel]));
  const currentRelMap = new Map(currentRels.map((rel) => [rel.id, rel]));

  for (const rel of currentRels) {
    const sourceId = relationshipEnd(rel, "sourceId");
    const targetId = relationshipEnd(rel, "targetId");
    const before = previousRelMap.get(rel.id);
    if (!before) {
      events.push({
        kind: "relationship",
        change: "added",
        origin: originOf(rel, current, "relationship"),
        id: rel.id,
        type: relationshipType(rel),
        sourceId,
        targetId,
        sourceName: lookupName(currentNames, sourceId),
        targetName: lookupName(currentNames, targetId),
      });
      continue;
    }
    const promoted =
      isSketchEntity(before, previous, "relationship") &&
      !isSketchEntity(rel, current, "relationship") &&
      hasBlockEvidence(current, "relationship", rel.id);
    const kind = relationshipDiffKind(before, rel);
    if (!promoted && !kind) continue;
    const beforeType = relationshipType(before);
    const nextType = relationshipType(rel);
    events.push({
      kind: "relationship",
      change: promoted ? "promoted" : kind!,
      origin: promoted
        ? "sketch"
        : originOf(rel, current, "relationship"),
      id: rel.id,
      type: nextType,
      previousType: beforeType !== nextType ? beforeType : undefined,
      sourceId,
      targetId,
      sourceName: lookupName(currentNames, sourceId),
      targetName: lookupName(currentNames, targetId),
    });
  }
  for (const rel of previousRels) {
    if (currentRelMap.has(rel.id)) continue;
    const sourceId = relationshipEnd(rel, "sourceId");
    const targetId = relationshipEnd(rel, "targetId");
    events.push({
      kind: "relationship",
      change: "removed",
      origin: originOf(rel, previous, "relationship"),
      id: rel.id,
      type: relationshipType(rel),
      sourceId,
      targetId,
      sourceName: lookupName(previousNames, sourceId),
      targetName: lookupName(previousNames, targetId),
    });
  }

  appendNewlyMarkedEdits({
    events,
    previous,
    current,
    currentNodes,
    currentRels,
    previousNodeMap,
    previousRelMap,
    currentNames,
  });

  return events;
}

function eventCoversEntity(
  events: WorkspaceGraphEvent[],
  kind: "node" | "relationship",
  id: string,
): boolean {
  return events.some(
    (event) =>
      event.kind === kind &&
      event.id === id &&
      (event.change === "added" ||
        event.change === "updated" ||
        event.change === "property" ||
        event.change === "promoted"),
  );
}

function pushMarkedEdit(
  events: WorkspaceGraphEvent[],
  kind: "node" | "relationship",
  entity: GraphRecord & { id: string },
  origin: GraphEventOrigin,
  existed: boolean,
  names: Map<string, string>,
) {
  if (kind === "node") {
    events.push({
      kind: "node",
      change: existed ? "updated" : "added",
      origin,
      id: entity.id,
      name: nodeName(entity),
      label: nodeLabel(entity),
    });
    return;
  }
  const sourceId = relationshipEnd(entity, "sourceId");
  const targetId = relationshipEnd(entity, "targetId");
  events.push({
    kind: "relationship",
    change: existed ? "updated" : "added",
    origin,
    id: entity.id,
    type: relationshipType(entity),
    sourceId,
    targetId,
    sourceName: lookupName(names, sourceId),
    targetName: lookupName(names, targetId),
  });
}

/** ノード自体は増えていなくても、手入力・下書きの印が新しく付いた分を出す。 */
function appendNewlyMarkedEdits(input: {
  events: WorkspaceGraphEvent[];
  previous: unknown;
  current: unknown;
  currentNodes: Array<GraphRecord & { id: string }>;
  currentRels: Array<GraphRecord & { id: string }>;
  previousNodeMap: Map<string, GraphRecord & { id: string }>;
  previousRelMap: Map<string, GraphRecord & { id: string }>;
  currentNames: Map<string, string>;
}) {
  const kinds = ["node", "relationship"] as const;
  for (const kind of kinds) {
    const entities = kind === "node" ? input.currentNodes : input.currentRels;
    const previousIds =
      kind === "node" ? input.previousNodeMap : input.previousRelMap;
    const groups = [
      { group: "added" as const, origin: "manual" as const },
      { group: "sketches" as const, origin: "sketch" as const },
    ];
    for (const { group, origin } of groups) {
      const currentIds = editIdSet(input.current, group, kind);
      const already = editIdSet(input.previous, group, kind);
      for (const id of currentIds) {
        if (already.has(id)) continue;
        if (eventCoversEntity(input.events, kind, id)) continue;
        const entity = entities.find((item) => item.id === id);
        if (!entity) continue;
        pushMarkedEdit(
          input.events,
          kind,
          entity,
          origin,
          previousIds.has(id),
          input.currentNames,
        );
      }
    }
  }
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
