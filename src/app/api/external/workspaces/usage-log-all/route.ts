import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { resolveExternalWorkspaceUser } from "@/server/services/workspace/resolve-external-auth";
import {
  listWritingUsageLogBySources,
  parseUsageLogAllCursor,
  parseUsageLogAllSources,
} from "@/server/services/workspace/external-workspace";

export async function GET(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const sources = parseUsageLogAllSources(
    request.nextUrl.searchParams.get("sources"),
  );
  if (sources.length === 0) {
    return NextResponse.json(
      { error: "sources query is required" },
      { status: 400 },
    );
  }

  const takeParam = request.nextUrl.searchParams.get("take");
  const take = takeParam ? Number(takeParam) : undefined;
  try {
    const before = parseUsageLogAllCursor({
      createdAt: request.nextUrl.searchParams.get("beforeCreatedAt"),
      id: request.nextUrl.searchParams.get("beforeId"),
    });
    const log = await listWritingUsageLogBySources({
      db,
      userId: auth.userId,
      sources,
      take: Number.isFinite(take) ? take : undefined,
      before,
    });
    return NextResponse.json(log);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load usage log";
    const status =
      message.includes("sources query") ||
      message.includes("beforeCreatedAt") ||
      message.includes("before cursor")
        ? 400
        : message.includes("access denied")
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
