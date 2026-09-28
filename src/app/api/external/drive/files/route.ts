import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { listDriveImageFilesInFolder } from "@/server/lib/google-drive/list-images";
import {
  getGoogleDriveClientForUser,
  hasUserGoogleDriveConnection,
} from "@/server/lib/google-drive/user-oauth";
import { resolveExternalWorkspaceUser } from "@/server/services/workspace/resolve-external-auth";

export async function GET(request: NextRequest) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const folderId = request.nextUrl.searchParams.get("folderId")?.trim();
  if (!folderId) {
    return NextResponse.json({ error: "folderId is required" }, { status: 400 });
  }

  const connected = await hasUserGoogleDriveConnection(db, auth.userId);
  if (!connected) {
    return NextResponse.json(
      {
        error:
          "Google Drive が未連携です。Ars Traverse のリポジトリ画面から Drive を連携してください。",
        connected: false,
        files: [],
      },
      { status: 409 },
    );
  }

  try {
    const drive = await getGoogleDriveClientForUser(db, auth.userId);
    const files = await listDriveImageFilesInFolder(drive, folderId);
    return NextResponse.json({ connected: true, files });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Drive フォルダの取得に失敗しました";
    return NextResponse.json(
      { error: message, connected: true, files: [] },
      { status: 502 },
    );
  }
}
