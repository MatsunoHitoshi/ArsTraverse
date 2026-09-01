import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { resolveExternalWorkspaceUser } from "@/server/services/workspace/resolve-external-auth";
import {
  listWritingHistory,
  restoreWritingHistory,
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

  try {
    const histories = await listWritingHistory({
      db,
      workspaceId,
      userId: auth.userId,
    });
    return NextResponse.json({ histories });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load history";
    const status = message.includes("access denied") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json()) as {
    workspaceId?: string;
    historyId?: string;
  };
  if (!body.workspaceId || !body.historyId) {
    return NextResponse.json(
      { error: "workspaceId and historyId are required" },
      { status: 400 },
    );
  }

  try {
    const workspace = await restoreWritingHistory({
      db,
      workspaceId: body.workspaceId,
      historyId: body.historyId,
      userId: auth.userId,
    });
    return NextResponse.json({ workspace });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to restore history";
    const status = message.includes("not found")
      ? 404
      : message.includes("access denied")
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
