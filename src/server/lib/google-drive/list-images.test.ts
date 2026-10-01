import type { drive_v3 } from "googleapis";
import { describe, expect, it } from "vitest";
import {
  driveItemIsInsideFolder,
  listDriveFolderChildren,
} from "./list-images";

const FOLDER = "application/vnd.google-apps.folder";

function driveWith(input: {
  files?: drive_v3.Schema$File[];
  parents?: Record<string, string[]>;
}): drive_v3.Drive {
  return {
    files: {
      list: async () => ({ data: { files: input.files ?? [] } }),
      get: async ({ fileId }: { fileId: string }) => {
        const parents = input.parents?.[fileId];
        if (!parents) throw new Error("missing");
        return { data: { id: fileId, parents } };
      },
    },
  } as unknown as drive_v3.Drive;
}

describe("listDriveFolderChildren", () => {
  it("直下の画像とフォルダだけを分け、それ以外は捨てる", async () => {
    const drive = driveWith({
      files: [
        { id: "img-b", name: "ばなな.jpg", mimeType: "image/jpeg" },
        { id: "folder-b", name: "資料", mimeType: FOLDER },
        { id: "doc", name: "メモ.pdf", mimeType: "application/pdf" },
        { id: "folder-a", name: "あいう", mimeType: FOLDER },
        { id: "img-a", name: "あ.jpg", mimeType: "image/png" },
        { id: "", name: "空", mimeType: "image/jpeg" },
      ],
    });

    const listing = await listDriveFolderChildren(drive, "root");

    expect(listing.folders.map((folder) => folder.name)).toEqual(["あいう", "資料"]);
    expect(listing.files.map((file) => file.name)).toEqual(["あ.jpg", "ばなな.jpg"]);
  });
});

describe("driveItemIsInsideFolder", () => {
  const parents = {
    file: ["child"],
    child: ["root"],
    outside: ["other"],
    loopA: ["loopB"],
    loopB: ["loopA"],
  };

  it("親を辿ってルートフォルダに届くファイルを認める", async () => {
    const drive = driveWith({ parents });
    await expect(driveItemIsInsideFolder(drive, "file", "root")).resolves.toBe(true);
    await expect(driveItemIsInsideFolder(drive, "root", "root")).resolves.toBe(true);
  });

  it("別の親を持つファイルと、親が循環するファイルは認めない", async () => {
    const drive = driveWith({ parents });
    await expect(driveItemIsInsideFolder(drive, "outside", "root")).resolves.toBe(false);
    await expect(driveItemIsInsideFolder(drive, "loopA", "root")).resolves.toBe(false);
    await expect(driveItemIsInsideFolder(drive, "missing", "root")).resolves.toBe(false);
  });
});
