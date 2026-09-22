import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { resolveExternalWorkspaceUser } from "@/server/services/workspace/resolve-external-auth";
import {
  getWritingUsageLogGraph,
  listWritingUsageLog,
} from "@/server/services/workspace/external-workspace";

export async function GET(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId")?.trim();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId query is required" },
      { status: 400 },
    );
  }

  const historyId = request.nextUrl.searchParams.get("historyId")?.trim();
  try {
    if (historyId) {
      const currentGraph = await getWritingUsageLogGraph({
        db,
        workspaceId,
        historyId,
        userId: auth.userId,
      });
      return NextResponse.json({ currentGraph });
    }

    const takeParam = request.nextUrl.searchParams.get("take");
    const take = takeParam ? Number(takeParam) : undefined;
    const log = await listWritingUsageLog({
      db,
      workspaceId,
      userId: auth.userId,
      take: Number.isFinite(take) ? take : undefined,
    });
    return NextResponse.json(log);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load usage log";
    const status = message.includes("not found")
      ? 404
      : message.includes("access denied")
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
