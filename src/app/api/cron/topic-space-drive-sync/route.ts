import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { syncAllEnabledTopicSpaceDriveFolders } from "@/server/services/kg/sync-topic-space-drive.service";

export const maxDuration = 300;
export const revalidate = 0;

export const GET = async () => {
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
