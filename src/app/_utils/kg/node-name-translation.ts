import type { GraphNode, GraphRelationship } from "@prisma/client";
import { HuggingFaceTranslator } from "@/server/lib/translation/huggingface-translator";

export async function completeTranslateProperties(graph: {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}) {
  const translator = new HuggingFaceTranslator();
  await translator.initialize();
  async function ensureBilingualProperties(
    properties: Record<string, string>,
    nodeName: string,
  ): Promise<Record<string, string>> {
    const enhanced: Record<string, string> = { ...properties };

    const hasJa = !!enhanced.name_ja && enhanced.name_ja.trim() !== "";
    const hasEn = !!enhanced.name_en && enhanced.name_en.trim() !== "";

    if (!hasJa && !hasEn) {
      enhanced.name_ja = nodeName;
      enhanced.name_en = nodeName;
      return enhanced;
    }

    if (!hasJa && hasEn) {
      try {
        enhanced.name_ja = await translator.translateEnToJa(
          enhanced.name_en ?? "",
        );
      } catch {
        enhanced.name_ja = enhanced.name_en ?? nodeName;
      }
    } else if (hasJa && !hasEn) {
      try {
        enhanced.name_en = await translator.translateJaToEn(
          enhanced.name_ja ?? "",
        );
      } catch {
        enhanced.name_en = enhanced.name_ja ?? nodeName;
      }
    }

    return enhanced;
  }

  const translatedNodes = await Promise.all(
    graph.nodes.map(async (node) => {
      const baseProps = node.properties ?? {};
      const props = await ensureBilingualProperties(
        baseProps as Record<string, string>,
        node.name,
      );
      console.log("translated properties: ", props);
      return { ...node, properties: props } as GraphNode;
    }),
  );

  return { nodes: translatedNodes, relationships: graph.relationships };
}
