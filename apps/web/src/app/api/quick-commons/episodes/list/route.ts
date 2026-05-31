import { NextResponse } from "next/server";
import { api } from "@/trpc/server";
import { env } from "@/env";
import { getTextFromDocumentFile } from "@/app/_utils/text/text";
import { createCorsResponse, createCorsOptionsResponse } from "../../cors";

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return createCorsOptionsResponse(origin);
}

export async function GET(request: Request) {
  try {
    if (!env.QUICK_COMMONS_TOPICSPACE_ID) {
      const response = NextResponse.json(
        { error: "Quick Commons API is not configured" },
        { status: 500 },
      );
      const origin = request.headers.get("origin");
      return createCorsResponse(response, origin);
    }

    const res = await api.topicSpaces.getByIdPublic({
      id: env.QUICK_COMMONS_TOPICSPACE_ID,
    });

    if (!res.sourceDocuments) {
      const response = NextResponse.json({
        episodes: [],
      });
      const origin = request.headers.get("origin");
      return createCorsResponse(response, origin);
    }

    // 各SourceDocumentのテキストを取得
    const episodes = await Promise.all(
      res.sourceDocuments.map(async (doc) => {
        let text = "";
        try {
          text = await getTextFromDocumentFile(doc.url, doc.documentType);
        } catch (error) {
          console.error(`Failed to get text for document ${doc.id}:`, error);
          text = "";
        }

        return {
          id: doc.id,
          name: doc.name,
          text,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString(),
        };
      }),
    );

    const response = NextResponse.json({
      episodes,
    });
    const origin = request.headers.get("origin");
    return createCorsResponse(response, origin);
  } catch (error) {
    console.error("Error in episodes/list endpoint:", error);
    const response = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
    const origin = request.headers.get("origin");
    return createCorsResponse(response, origin);
  }
}
