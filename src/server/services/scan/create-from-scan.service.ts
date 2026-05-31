import { DocumentType, type Prisma, type PrismaClient } from "@prisma/client";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { formDocumentGraphForFrontend } from "@/app/_utils/kg/frontend-properties";
import type { CreateFromScanInput } from "@/server/api/schemas/scan";
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

export async function createFromScan(
  ctx: CreateFromScanCtx,
  input: CreateFromScanInput,
) {
  const plainText = input.plainText.trim();
  if (!plainText) {
    throw new Error("OCR テキストが空です");
  }

  const textBlob = new Blob([plainText], {
    type: "text/plain; charset=utf-8",
  });
  const textUrl = await storageUtils.uploadFromBlob(
    textBlob,
    BUCKETS.PATH_TO_INPUT_TXT,
  );
  if (!textUrl) {
    throw new Error("OCR テキストのアップロードに失敗しました");
  }

  let sourceImageUrl: string | null = null;
  if (input.sourceImageUrl) {
    sourceImageUrl = input.sourceImageUrl;
  } else if (input.imageDataUrl) {
    sourceImageUrl = await storageUtils.uploadFromDataURL(
      input.imageDataUrl,
      BUCKETS.PATH_TO_INPUT_SCAN,
    );
    if (!sourceImageUrl) {
      throw new Error("スキャン画像のアップロードに失敗しました");
    }
  }

  const extracted = await runExtractKGFromPlainText(plainText);
  if (!extracted) {
    throw new Error("知識グラフの抽出に失敗しました");
  }
  const dataJson = KnowledgeGraphInputSchema.parse(extracted);

  const { documentGraph, sourceDocument } = await createSourceDocumentWithGraph(
    ctx,
    {
      name: input.name,
      url: textUrl,
      dataJson,
      documentType: DocumentType.INPUT_SCAN,
      sourceImageUrl,
      ocrMetadata: (input.ocrMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  );

  if (input.topicSpaceId) {
    await attachDocumentsToTopicSpace(ctx, {
      id: input.topicSpaceId,
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
    dataJson.nodes.map((node) => node.name),
    20,
  );

  return {
    sourceDocument,
    graph,
    matchCandidates,
  };
}
