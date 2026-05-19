export type GraphScope =
  | { kind: "topicSpace"; id: string }
  | { kind: "documentGraph"; id: string };

export function topicSpaceScope(topicSpaceId: string): GraphScope {
  return { kind: "topicSpace", id: topicSpaceId };
}

export function documentGraphScope(documentGraphId: string): GraphScope {
  return { kind: "documentGraph", id: documentGraphId };
}

export function nodeScopeFilter(scope: GraphScope): {
  topicSpaceId?: string;
  documentGraphId?: string;
} {
  if (scope.kind === "topicSpace") {
    return { topicSpaceId: scope.id };
  }
  return { documentGraphId: scope.id };
}

export function relationshipScopeFilter(scope: GraphScope): {
  topicSpaceId?: string;
  documentGraphId?: string;
} {
  return nodeScopeFilter(scope);
}

export function nodeCreateScopeFields(scope: GraphScope): {
  topicSpaceId: string | null;
  documentGraphId: string | null;
} {
  if (scope.kind === "topicSpace") {
    return { topicSpaceId: scope.id, documentGraphId: null };
  }
  return { topicSpaceId: null, documentGraphId: scope.id };
}

export function clearNodeScopeFields(): {
  topicSpaceId: null;
  documentGraphId: null;
  deletedAt: Date;
} {
  return {
    topicSpaceId: null,
    documentGraphId: null,
    deletedAt: new Date(),
  };
}

export function clearRelationshipScopeFields(): {
  topicSpaceId: null;
  documentGraphId: null;
  deletedAt: Date;
} {
  return clearNodeScopeFields();
}
