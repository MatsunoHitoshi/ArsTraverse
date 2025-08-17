import { NextResponse } from "next/server";
import { api } from "@/trpc/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const topicSpaceId = params.id;

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
