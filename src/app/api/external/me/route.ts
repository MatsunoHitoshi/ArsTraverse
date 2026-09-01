import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { resolveExternalWorkspaceUser } from "@/server/services/workspace/resolve-external-auth";
import { getExternalAuthenticatedUser } from "@/server/services/workspace/external-workspace";

export async function GET(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const user = await getExternalAuthenticatedUser({
      db,
      userId: auth.userId,
    });
    return NextResponse.json({ user });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load user";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
