import { DocumentType } from "@prisma/client";
import { z } from "zod";
import { GraphDocumentFrontendSchema } from "@/server/api/schemas/knowledge-graph";

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
    /** INPUT_SCAN のみ。Storage URL が使えない場合の表示フォールバック用。 */
    plainText: z.string().optional(),
  })
  .catchall(z.unknown());

export const CreateFromScanInputSchema = z.object({
  name: z.string().min(1),
  plainText: z.string().min(1),
  /** プレビュー済みグラフ。指定時は保存時に再抽出せずこの内容を保存する。 */
  graphDocument: GraphDocumentFrontendSchema.optional(),
  ocrMetadata: OcrMetadataSchema.optional(),
  /** Pre-uploaded OCR text file URL (preferred — avoids server-side storage auth issues). */
  sourceTextUrl: z.string().url().optional(),
  /** Pre-uploaded scan image URL (preferred — avoids large tRPC payloads). */
  sourceImageUrl: z.string().url().optional(),
  /** @deprecated Prefer uploading client-side and passing sourceImageUrl. */
  imageDataUrl: z.string().optional(),
  topicSpaceId: z.string().optional(),
});

export const NormalizeOcrTextInputSchema = z.object({
  plainText: z.string().min(1).max(50000),
  language: z.enum(["jpn", "jpn_vert", "eng"]).optional(),
});

export const RenameScanSessionInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

export const SearchPublishedNodesInputSchema = z.object({
  query: z.string().min(1),
  workspaceId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const SearchNodeMatchesByNamesInputSchema = z.object({
  nodeNames: z.array(z.string().min(1)).min(1).max(200),
  excludeSourceDocumentId: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const PublishedNodeMatchSchema = z.object({
  nodeId: z.string(),
  name: z.string(),
  label: z.string(),
  sourceType: z.enum(["workspace", "sourceDocument", "topicSpace"]),
  workspaceId: z.string().optional(),
  workspaceName: z.string().optional(),
  topicSpaceId: z.string().optional(),
  topicSpaceName: z.string().optional(),
  sourceDocumentId: z.string().optional(),
  sourceDocumentName: z.string().optional(),
  sourceDocumentType: z.nativeEnum(DocumentType).optional(),
});

export type OcrMetadata = z.infer<typeof OcrMetadataSchema>;
export type OcrRegion = z.infer<typeof OcrRegionSchema>;
export type CreateFromScanInput = z.infer<typeof CreateFromScanInputSchema>;
export type NormalizeOcrTextInput = z.infer<typeof NormalizeOcrTextInputSchema>;
export type RenameScanSessionInput = z.infer<typeof RenameScanSessionInputSchema>;
export type SearchPublishedNodesInput = z.infer<
  typeof SearchPublishedNodesInputSchema
>;
export type SearchNodeMatchesByNamesInput = z.infer<
  typeof SearchNodeMatchesByNamesInputSchema
>;
export type PublishedNodeMatch = z.infer<typeof PublishedNodeMatchSchema>;
