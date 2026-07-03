import type { NodeTypeForFrontend } from "@/app/const/types";

function nodeAppearsInChunk(
  node: NodeTypeForFrontend,
  chunkText: string,
): boolean {
  if (chunkText.includes(node.name)) return true;

  const ja = node.properties?.name_ja?.trim();
  if (ja && chunkText.includes(ja)) return true;

  const en = node.properties?.name_en?.trim();
  if (en && en !== node.name && chunkText.includes(en)) return true;

  return false;
}

export function filterNodesForChunk(
  chunkText: string,
  nodes: NodeTypeForFrontend[],
): NodeTypeForFrontend[] {
  return nodes.filter((node) => nodeAppearsInChunk(node, chunkText));
}

export function buildLocalContextFromNodes(
  chunkText: string,
  nodes: NodeTypeForFrontend[],
): string {
  return filterNodesForChunk(chunkText, nodes)
    .map((n) => {
      const ja = n.properties?.name_ja ? `(${n.properties.name_ja})` : "";
      return `- ${n.name} [${n.label}] ${ja}`;
    })
    .join("\n");
}
