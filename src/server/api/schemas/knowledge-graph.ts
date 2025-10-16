import { z } from "zod";

export const KnowledgeGraphInputSchema = z.object({
  nodes: z.array(z.any()),
  relationships: z.array(z.any()),
});
