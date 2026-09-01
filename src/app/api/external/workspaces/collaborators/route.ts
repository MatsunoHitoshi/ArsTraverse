import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { resolveExternalWorkspaceUser } from "@/server/services/workspace/resolve-external-auth";
import {
  addCollaboratorToWorkspace,
  resolveCollaboratorUserId,
} from "@/server/services/workspace/external-workspace";

export async function POST(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json()) as {
    workspaceId?: string;
    userId?: string;
    userEmail?: string;
  };

  const workspaceId = body.workspaceId?.trim();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400 },
    );
  }

  if (!body.userId && !body.userEmail) {
    return NextResponse.json(
      { error: "userId or userEmail is required" },
      { status: 400 },
    );
  }

  try {
    const collaboratorUserId = await resolveCollaboratorUserId({
      db,
      userId: body.userId,
      userEmail: body.userEmail,
    });

    const result = await addCollaboratorToWorkspace({
      db,
      workspaceId,
      ownerUserId: auth.userId,
      collaboratorUserId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add collaborator";
    const status = message.includes("access denied")
      ? 403
      : message.includes("not found") || message.includes("required")
        ? message.includes("required")
          ? 400
          : 404
        : message.includes("Owner cannot")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
