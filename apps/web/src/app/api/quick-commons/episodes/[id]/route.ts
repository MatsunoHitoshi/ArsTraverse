import { NextResponse } from "next/server";
import { api } from "@/trpc/server";
import { env } from "@/env";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import { db } from "@/server/db";
import { createCorsResponse, createCorsOptionsResponse } from "../../cors";

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return createCorsOptionsResponse(origin);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!env.QUICK_COMMONS_TOPICSPACE_ID) {
      const response = NextResponse.json(
        { error: "Quick Commons API is not configured" },
        { status: 500 },
      );
      const origin = request.headers.get("origin");
      return createCorsResponse(response, origin);
    }

    const { id } = await params;

    // SourceDocumentを取得（TRPCプロシージャを使用）
    const sourceDocument = await api.sourceDocument.getByIdPublic({ id });

    // 固定Topicspaceに統合されているか確認
    const topicSpace = await db.topicSpace.findFirst({
      where: {
        id: env.QUICK_COMMONS_TOPICSPACE_ID,
        isDeleted: false,
      },
      include: {
        sourceDocuments: {
          where: {
            id: sourceDocument.id,
            isDeleted: false,
          },
        },
      },
    });

    if (!topicSpace || topicSpace.sourceDocuments.length === 0) {
      const response = NextResponse.json(
        { error: "SourceDocument is not integrated into the topicspace" },
        { status: 404 },
      );
      const origin = request.headers.get("origin");
      return createCorsResponse(response, origin);
    }

    // テキストを取得
    let text = "";
    try {
      text = await getTextFromDocumentFile(
        sourceDocument.url,
        sourceDocument.documentType,
      );
    } catch (error) {
      console.error(`Failed to get text for document ${id}:`, error);
      text = "";
    }

    const response = NextResponse.json({
      id: sourceDocument.id,
      name: sourceDocument.name,
      url: sourceDocument.url,
      text,
      createdAt: sourceDocument.createdAt.toISOString(),
      updatedAt: sourceDocument.updatedAt.toISOString(),
      graph: sourceDocument.graph?.dataJson ?? null,
    });
    const origin = request.headers.get("origin");
    return createCorsResponse(response, origin);
  } catch (error) {
    console.error("Error in episodes/[id] endpoint:", error);
    const origin = request.headers.get("origin");
    if (error instanceof Error && error.message === "Document not found") {
      const response = NextResponse.json(
        { error: "SourceDocument not found" },
        { status: 404 },
      );
      return createCorsResponse(response, origin);
    }
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
    return createCorsResponse(response, origin);
  }
}
