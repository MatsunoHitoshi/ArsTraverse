import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { resolveExternalWorkspaceUser } from "@/server/services/workspace/resolve-external-auth";
import {
  listCurationHistories,
  undoCurationHistories,
} from "@/server/services/workspace/external-workspace";

const SOURCES = ["sos-research", "sos-research-concept"];

export async function GET(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const histories = await listCurationHistories({
      db,
      userId: auth.userId,
      sources: SOURCES,
    });
    return NextResponse.json({ histories });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load curation history";
    const status = message.includes("access denied") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json()) as { historyIds?: string[] };
  if (!Array.isArray(body.historyIds)) {
    return NextResponse.json(
      { error: "historyIds are required" },
      { status: 400 },
    );
  }

  try {
    const result = await undoCurationHistories({
      db,
      userId: auth.userId,
      historyIds: body.historyIds.filter((id) => typeof id === "string"),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to undo curation history";
    const status = message.includes("not found") || message.includes("見つかりません")
      ? 404
      : message.includes("access denied")
        ? 403
        : message.includes("戻せません") || message.includes("取り消せません")
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
