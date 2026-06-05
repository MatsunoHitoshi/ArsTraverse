import type { PrismaClient } from "@prisma/client";
import { DocumentType } from "@prisma/client";
import { formDocumentGraphForFrontend } from "@/app/_utils/kg/frontend-properties";
import type { LocaleEnum } from "@/app/const/types";
import type { OcrMetadata } from "@/server/api/schemas/scan";
import { resolveScanPlainText } from "@/server/services/scan/resolve-scan-plain-text";
import { searchUserNodeMatchesByNames } from "@/server/services/scan/search-user-node-matches.service";

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
  const ocrMetadata = document.ocrMetadata as OcrMetadata | null;
  const plainText = await resolveScanPlainText(
    document.url,
    document.documentType,
    ocrMetadata,
  );
  const matchCandidates = await searchUserNodeMatchesByNames(
    ctx,
    graphRecord.dataJson.nodes.map((node) => node.name),
    sourceDocumentId,
    Math.min(Math.max(graphRecord.dataJson.nodes.length * 5, 20), 100),
  );

  return {
    id: document.id,
    name: document.name,
    createdAt: document.createdAt,
    sourceImageUrl: document.sourceImageUrl,
    ocrMetadata,
    plainText,
    graph: graphRecord.dataJson,
    graphId: document.graph.id,
    matchCandidates,
  };
}
