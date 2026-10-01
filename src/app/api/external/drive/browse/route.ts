import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import {
  driveItemIsInsideFolder,
  listDriveFolderChildren,
} from "@/server/lib/google-drive/list-images";
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

  const within = request.nextUrl.searchParams.get("within")?.trim() ?? "";
  const folderId = request.nextUrl.searchParams.get("folderId")?.trim() ?? "";
  const fileId = request.nextUrl.searchParams.get("fileId")?.trim() ?? "";
  if (!within) {
    return NextResponse.json({ error: "within is required" }, { status: 400 });
  }

  const connected = await hasUserGoogleDriveConnection(db, auth.userId);
  if (!connected) {
    return NextResponse.json(
      {
        error:
          "Google Drive が未連携です。Ars Traverse のリポジトリ画面から Drive を連携してください。",
        connected: false,
        files: [],
        folders: [],
        inside: false,
      },
      { status: 409 },
    );
  }

  try {
    const drive = await getGoogleDriveClientForUser(db, auth.userId);
    if (fileId) {
      const inside = await driveItemIsInsideFolder(drive, fileId, within);
      return NextResponse.json({ connected: true, inside });
    }

    const target = folderId || within;
    if (target !== within) {
      const inside = await driveItemIsInsideFolder(drive, target, within);
      if (!inside) {
        return NextResponse.json(
          {
            error: "フォルダが見つかりません",
            connected: true,
            files: [],
            folders: [],
          },
          { status: 404 },
        );
      }
    }

    const listing = await listDriveFolderChildren(drive, target);
    return NextResponse.json({
      connected: true,
      folderId: target,
      ...listing,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Drive フォルダの取得に失敗しました";
    return NextResponse.json(
      { error: message, connected: true, files: [], folders: [] },
      { status: 502 },
    );
  }
}
