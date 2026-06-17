export type MotionPromptEdgeInput = {
  edgeType: string;
  sourceName?: string;
  sourceLabel?: string;
  targetName?: string;
  targetLabel?: string;
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, " ");
}

function withIndefiniteArticle(nounPhrase: string): string {
  const trimmed = nounPhrase.trim();
  if (!trimmed) return "a person";
  const article = /^[aeiou]/.test(trimmed) ? "an" : "a";
  return `${article} ${trimmed}`;
}

/**
 * Map a node to a motion-friendly noun phrase.
 * Prefers `label` (type abstraction) over `name` (concrete entity).
 */
function nodeToMotionNoun(opts: {
  label?: string;
  name?: string;
}): string {
  if (opts.label?.trim()) {
    return withIndefiniteArticle(normalizeToken(opts.label));
  }
  if (opts.name?.trim()) {
    return withIndefiniteArticle(normalizeToken(opts.name));
  }
  return "a person";
}

function edgeTypeToVerbPhrase(edgeType: string): string {
  return normalizeToken(edgeType);
}

/**
 * Build a T2M prompt from edge metadata using abstract node labels.
 *
 * Example: Person --GREETS--> Person → "a person greets a person"
 * (not "Alice greets Bob")
 */
export function buildMotionPrompt(edge: MotionPromptEdgeInput): string {
  const subject = nodeToMotionNoun({
    label: edge.sourceLabel,
    name: edge.sourceName,
  });
  const verb = edgeTypeToVerbPhrase(edge.edgeType);
  const object = nodeToMotionNoun({
    label: edge.targetLabel,
    name: edge.targetName,
  });
  return `${subject} ${verb} ${object}`;
}

/**
 * Build a concrete prompt using node names (legacy / debug).
 * Example: Alice --GREETS--> Bob → "alice greets bob"
 */
export function buildConcreteMotionPrompt(edge: MotionPromptEdgeInput): string {
  const parts: string[] = [];
  if (edge.sourceName) parts.push(normalizeToken(edge.sourceName));
  parts.push(edgeTypeToVerbPhrase(edge.edgeType));
  if (edge.targetName) parts.push(normalizeToken(edge.targetName));
  return parts.join(" ");
}

/** Build a motion prompt from a graph link with resolved source/target nodes. */
export function buildMotionPromptFromLink(link: {
  type: string;
  source: { name?: string; label?: string };
  target: { name?: string; label?: string };
}): string {
  return buildMotionPrompt({
    edgeType: link.type,
    sourceName: link.source.name,
    sourceLabel: link.source.label,
    targetName: link.target.name,
    targetLabel: link.target.label,
  });
}
