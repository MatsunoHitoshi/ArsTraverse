import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { syncAllEnabledTopicSpaceDriveFolders } from "@/server/services/kg/sync-topic-space-drive.service";

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
    const results = await syncAllEnabledTopicSpaceDriveFolders(db);
    return NextResponse.json({
      message: "Drive sync completed",
      topicSpaceCount: results.length,
      results,
    });
  } catch (error) {
    console.error("Drive sync cron failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Drive sync cron failed",
      },
      { status: 500 },
    );
  }
};
