import { DocumentType, type Prisma, type PrismaClient } from "@prisma/client";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { formDocumentGraphForFrontend } from "@/app/_utils/kg/frontend-properties";
import {
  CreateFromScanInputSchema,
  type CreateFromScanInput,
} from "@/server/api/schemas/scan";
import { KnowledgeGraphInputSchema } from "@/server/api/schemas/knowledge-graph";
import { runExtractKGFromPlainText } from "@/server/api/routers/kg-extraction";
import { createSourceDocumentWithGraph } from "@/server/services/kg/create-source-document-with-graph.service";
import { attachDocumentsToTopicSpace } from "@/server/services/kg/attach-documents.service";
import {
  searchPublishedNodesByNames,
} from "@/server/services/workspace/search-published-nodes.service";

type CreateFromScanCtx = {
  db: PrismaClient;
  session: { user: { id: string } };
};

async function resolveTextUploadUrl(
  plainText: string,
  preUploadedUrl?: string,
): Promise<string> {
  if (preUploadedUrl) {
    return preUploadedUrl;
  }

  const textBlob = new Blob([plainText], {
    type: "text/plain; charset=utf-8",
  });
  const uploadedUrl = await storageUtils.uploadFromBlob(
    textBlob,
    BUCKETS.PATH_TO_INPUT_TXT,
  );
  if (!uploadedUrl) {
    throw new Error("OCR テキストのアップロードに失敗しました");
  }

  return uploadedUrl;
}

type ParsedCreateFromScanInput = {
  name: string;
  plainText: string;
  graphDocument?: CreateFromScanInput["graphDocument"];
  sourceTextUrl?: string;
  sourceImageUrl?: string;
  imageDataUrl?: string;
  ocrMetadata?: CreateFromScanInput["ocrMetadata"];
  topicSpaceId?: string;
};

function normalizePropertiesToString(
  properties: Record<string, string | number | boolean | null> | undefined,
): Record<string, string> {
  if (!properties) return {};
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, String(value ?? "")]),
  );
}

export async function createFromScan(
  ctx: CreateFromScanCtx,
  input: CreateFromScanInput,
) {
  const validated: ParsedCreateFromScanInput =
    CreateFromScanInputSchema.parse(input);
  const {
    name,
    plainText: rawPlainText,
    graphDocument,
    sourceTextUrl,
    sourceImageUrl: uploadedImageUrl,
    imageDataUrl,
    ocrMetadata: inputOcrMetadata,
    topicSpaceId,
  } = validated;

  const plainText = rawPlainText.trim();
  if (!plainText) {
    throw new Error("OCR テキストが空です");
  }

  const textUrl = await resolveTextUploadUrl(plainText, sourceTextUrl);

  const ocrMetadata = {
    ...(inputOcrMetadata ?? {}),
    plainText,
  };

  let sourceImageUrl: string | null = null;
  if (uploadedImageUrl) {
    sourceImageUrl = uploadedImageUrl;
  } else if (imageDataUrl) {
    sourceImageUrl = await storageUtils.uploadFromDataURL(
      imageDataUrl,
      BUCKETS.PATH_TO_INPUT_SCAN,
    );
    if (!sourceImageUrl) {
      throw new Error("スキャン画像のアップロードに失敗しました");
    }
  }

  const resolvedDataJson = graphDocument
    ? KnowledgeGraphInputSchema.parse({
        nodes: graphDocument.nodes.map((node) => ({
          id: node.id,
          name: node.name,
          label: node.label,
          properties: normalizePropertiesToString(node.properties),
          topicSpaceId: node.topicSpaceId,
          documentGraphId: node.documentGraphId,
        })),
        relationships: graphDocument.relationships.map((relationship) => ({
          id: relationship.id,
          type: relationship.type,
          properties: normalizePropertiesToString(relationship.properties),
          sourceId: relationship.sourceId,
          targetId: relationship.targetId,
          topicSpaceId: relationship.topicSpaceId,
          documentGraphId: relationship.documentGraphId,
        })),
      })
    : await (async () => {
        const extracted = await runExtractKGFromPlainText(plainText);
        if (!extracted) {
          throw new Error("知識グラフの抽出に失敗しました");
        }
        return KnowledgeGraphInputSchema.parse(extracted);
      })();

  const { documentGraph, sourceDocument } = await createSourceDocumentWithGraph(
    ctx,
    {
      name,
      url: textUrl,
      dataJson: resolvedDataJson,
      documentType: DocumentType.INPUT_SCAN,
      sourceImageUrl,
      ocrMetadata: ocrMetadata as Prisma.InputJsonValue,
    },
  );

  if (topicSpaceId) {
    await attachDocumentsToTopicSpace(ctx, {
      id: topicSpaceId,
      documentIds: [sourceDocument.id],
    });
  }

  const graphRecord = await ctx.db.documentGraph.findUniqueOrThrow({
    where: { id: documentGraph.id },
    include: { graphNodes: true, graphRelationships: true },
  });
  const graph = formDocumentGraphForFrontend(graphRecord);
  const matchCandidates = await searchPublishedNodesByNames(
    ctx,
    resolvedDataJson.nodes.map((node) => node.name),
    Math.min(Math.max(resolvedDataJson.nodes.length * 5, 20), 100),
  );

  return {
    sourceDocument,
    graph,
    matchCandidates,
  };
}
