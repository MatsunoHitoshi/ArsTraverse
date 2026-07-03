import { formGraphDataForFrontend } from "@/app/_utils/kg/frontend-properties";
import { completeTranslateProperties } from "@/app/_utils/kg/node-name-translation";
import type {
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";
import { dataDisambiguation } from "@/server/domain/kg/data-disambiguation";
import type { z } from "zod";
import type { KnowledgeGraphInputSchema } from "@/server/api/schemas/knowledge-graph";

export async function finalizeAccumulatedKg(
  nodes: NodeTypeForFrontend[],
  relationships: RelationshipTypeForFrontend[],
): Promise<z.infer<typeof KnowledgeGraphInputSchema>> {
  const normalized = {
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      label: n.label,
      properties: n.properties ?? {},
      documentGraphId: null,
      topicSpaceId: null,
      createdAt: null,
      updatedAt: null,
      deletedAt: null,
    })),
    relationships: relationships.map((r) => ({
      id: r.id,
      type: r.type,
      properties: r.properties ?? {},
      fromNodeId: r.sourceId,
      toNodeId: r.targetId,
      documentGraphId: null,
      topicSpaceId: null,
      createdAt: null,
      updatedAt: null,
      deletedAt: null,
    })),
  };

  const disambiguated = dataDisambiguation(normalized);
  const graphDocument = await completeTranslateProperties(disambiguated);
  return formGraphDataForFrontend(graphDocument);
}
