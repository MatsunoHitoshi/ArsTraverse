import { NextResponse } from "next/server";
import { api } from "@/trpc/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: topicSpaceId } = await params;

    const job = await api.graphEmbedding.createEmbeddingQueue({
      topicSpaceId,
    });

    return NextResponse.json(job);
  } catch (error) {
    console.error("Failed to create embedding job:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 },
    );
  }
}
