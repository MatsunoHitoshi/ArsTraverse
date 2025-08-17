import { NextResponse } from "next/server";
export const maxDuration = 60;
export const revalidate = 0;

export const GET = async (_request: Request, _res: Response) => {
  try {
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
