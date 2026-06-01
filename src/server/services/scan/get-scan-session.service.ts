import type { PrismaClient } from "@prisma/client";
import { DocumentType } from "@prisma/client";
import { formDocumentGraphForFrontend } from "@/app/_utils/kg/frontend-properties";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import type { LocaleEnum } from "@/app/const/types";
import type { OcrMetadata } from "@/server/api/schemas/scan";
import { searchPublishedNodesByNames } from "@/server/services/workspace/search-published-nodes.service";

type GetScanSessionCtx = {
  db: PrismaClient;
  session: { user: { id: string; preferredLocale?: string | null } };
};

export async function getScanSession(
  ctx: GetScanSessionCtx,
  sourceDocumentId: string,
) {
  const document = await ctx.db.sourceDocument.findFirst({
    where: {
      id: sourceDocumentId,
      userId: ctx.session.user.id,
      isDeleted: false,
      documentType: DocumentType.INPUT_SCAN,
    },
    include: {
      graph: {
        include: {
          graphNodes: true,
          graphRelationships: true,
        },
      },
    },
  });

  if (!document?.graph) {
    throw new Error("スキャンセッションが見つかりません");
  }

  const graphRecord = formDocumentGraphForFrontend(
    document.graph,
    (ctx.session.user.preferredLocale ?? "ja") as LocaleEnum,
  );
  const plainText = await getTextFromDocumentFile(
    document.url,
    document.documentType,
  );
  const matchCandidates = await searchPublishedNodesByNames(
    ctx,
    graphRecord.dataJson.nodes.map((node) => node.name),
    20,
  );

  return {
    id: document.id,
    name: document.name,
    createdAt: document.createdAt,
    sourceImageUrl: document.sourceImageUrl,
    ocrMetadata: document.ocrMetadata as OcrMetadata | null,
    plainText,
    graph: graphRecord.dataJson,
    graphId: document.graph.id,
    matchCandidates,
  };
}
