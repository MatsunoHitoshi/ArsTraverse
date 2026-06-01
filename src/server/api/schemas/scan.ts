import { z } from "zod";

export const OcrRegionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

export const OcrMetadataSchema = z
  .object({
    engine: z.string().optional(),
    language: z.string().optional(),
    confidence: z.number().optional(),
    processedAt: z.string().optional(),
    regions: z.array(OcrRegionSchema).optional(),
  })
  .catchall(z.unknown());

export const CreateFromScanInputSchema = z.object({
  name: z.string().min(1),
  plainText: z.string().min(1),
  ocrMetadata: OcrMetadataSchema.optional(),
  /** Pre-uploaded scan image URL (preferred — avoids large tRPC payloads). */
  sourceImageUrl: z.string().url().optional(),
  /** @deprecated Prefer uploading client-side and passing sourceImageUrl. */
  imageDataUrl: z.string().optional(),
  topicSpaceId: z.string().optional(),
});

export const SearchPublishedNodesInputSchema = z.object({
  query: z.string().min(1),
  workspaceId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const PublishedNodeMatchSchema = z.object({
  nodeId: z.string(),
  name: z.string(),
  label: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  topicSpaceId: z.string(),
  topicSpaceName: z.string(),
});

export type OcrMetadata = z.infer<typeof OcrMetadataSchema>;
export type OcrRegion = z.infer<typeof OcrRegionSchema>;
export type CreateFromScanInput = z.infer<typeof CreateFromScanInputSchema>;
export type SearchPublishedNodesInput = z.infer<
  typeof SearchPublishedNodesInputSchema
>;
export type PublishedNodeMatch = z.infer<typeof PublishedNodeMatchSchema>;
