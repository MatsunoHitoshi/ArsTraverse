import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { resolveExternalWorkspaceUser } from "@/server/services/workspace/resolve-external-auth";
import { listWritingUsageActivity } from "@/server/services/workspace/external-workspace";

export async function GET(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const source =
    request.nextUrl.searchParams.get("source")?.trim() || "sos-research";
  try {
    const activity = await listWritingUsageActivity({
      db,
      userId: auth.userId,
      source,
    });
    return NextResponse.json(activity);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load usage activity";
    const status = message.includes("access denied") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
