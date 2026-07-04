import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { processNextKgExtractionJob } from "@/server/services/kg-extraction/process-kg-extraction-job.service";

export const maxDuration = 300;
export const revalidate = 0;

function isAuthorizedCron(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.error("CRON_SECRET is not configured");
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export const GET = async (request: NextRequest) => {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const result = await processNextKgExtractionJob(db);
    return NextResponse.json({
      message: result.processed
        ? "KG extraction job processed"
        : "No pending KG extraction jobs",
      result,
    });
  } catch (error) {
    console.error("KG extraction cron failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "KG extraction cron failed",
      },
      { status: 500 },
    );
  }
};
