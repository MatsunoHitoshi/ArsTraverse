import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import {
  getGoogleDriveClientForUser,
  hasUserGoogleDriveConnection,
} from "@/server/lib/google-drive/user-oauth";
import { resolveExternalWorkspaceUser } from "@/server/services/workspace/resolve-external-auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  const auth = await resolveExternalWorkspaceUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { fileId: rawId } = await context.params;
  const fileId = decodeURIComponent(rawId).trim();
  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  const connected = await hasUserGoogleDriveConnection(db, auth.userId);
  if (!connected) {
    return NextResponse.json(
      {
        error:
          "Google Drive が未連携です。Ars Traverse のリポジトリ画面から Drive を連携してください。",
      },
      { status: 409 },
    );
  }

  try {
    const drive = await getGoogleDriveClientForUser(db, auth.userId);
    const meta = await drive.files.get({
      fileId,
      fields: "id, name, mimeType",
      supportsAllDrives: true,
    });
    const mimeType = meta.data.mimeType ?? "application/octet-stream";
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json(
        { error: "画像ファイルだけを取得できます" },
        { status: 400 },
      );
    }

    const media = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    const body = Buffer.from(media.data as ArrayBuffer);
    const fileName = meta.data.name ?? fileId;

    return new NextResponse(body, {
      headers: {
        "content-type": mimeType,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Drive ファイルの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
