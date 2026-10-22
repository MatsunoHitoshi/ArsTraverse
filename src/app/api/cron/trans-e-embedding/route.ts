import { NextResponse } from "next/server";
import {
  TRANS_E_EMBEDDING_IDLE_MESSAGE,
  probeTransEEmbeddingWork,
} from "@/server/cron/embedding-idle-probe";

export const maxDuration = 60;
export const revalidate = 0;

export const GET = async (_request: Request) => {
  try {
    const probe = await probeTransEEmbeddingWork();
    if (probe === "idle") {
      console.log("Embedding cron idle:", TRANS_E_EMBEDDING_IDLE_MESSAGE);
      return NextResponse.json({
        message: TRANS_E_EMBEDDING_IDLE_MESSAGE,
        processedCount: 0,
      });
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-trans-e-embedding-from-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({}),
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to process embeddings" },
        { status: 500 },
      );
    }

    const data = (await res.json()) as { message: string; results?: unknown[] };
    console.log("Response status:", res.status);
    console.log("Response data:", data);

    return NextResponse.json({
      message: data.message,
      processedCount: data.results?.length ?? 0,
    });
  } catch (error) {
    console.error("Error calling Supabase function:", error);
    return NextResponse.json(
      { error: "Failed to process embeddings" },
      { status: 500 },
    );
  }
};
