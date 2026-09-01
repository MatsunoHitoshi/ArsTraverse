import { NextResponse, type NextRequest } from "next/server";
import { WorkspaceStatus } from "@prisma/client";
import { db } from "@/server/db";
import { resolveExternalWorkspaceUser } from "@/server/services/workspace/resolve-external-auth";
import {
  getWorkspaceBySourceKey,
  listWorkspacesBySource,
  upsertWorkspaceBySource,
} from "@/server/services/workspace/external-workspace";

export async function GET(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const source = request.nextUrl.searchParams.get("source")?.trim();
  const sourceKey = request.nextUrl.searchParams.get("sourceKey")?.trim();
  if (!source) {
    return NextResponse.json(
      { error: "source query is required" },
      { status: 400 },
    );
  }

  if (sourceKey) {
    const workspace = await getWorkspaceBySourceKey({
      db,
      source,
      sourceKey,
      userId: auth.userId,
    });
    if (!workspace) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ workspace });
  }

  const workspaces = await listWorkspacesBySource({
    db,
    source,
    userId: auth.userId,
  });
  return NextResponse.json({ workspaces });
}

export async function PUT(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json()) as {
    source?: string;
    sourceKey?: string;
    name?: string;
    description?: string | null;
    content?: unknown;
    curatorialContext?: unknown;
    status?: WorkspaceStatus;
    changeDescription?: string;
    recordHistory?: boolean;
  };

  const source = body.source?.trim();
  const sourceKey = body.sourceKey?.trim();
  if (!source || !sourceKey) {
    return NextResponse.json(
      { error: "source and sourceKey are required" },
      { status: 400 },
    );
  }

  try {
    const workspace = await upsertWorkspaceBySource({
      db,
      userId: auth.userId,
      source,
      sourceKey,
      name: body.name,
      description: body.description,
      content: body.content,
      curatorialContext: body.curatorialContext,
      status: body.status,
      changeDescription: body.changeDescription,
      recordHistory: body.recordHistory,
    });
    return NextResponse.json({ workspace });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upsert workspace";
    const status = message.includes("access denied") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
