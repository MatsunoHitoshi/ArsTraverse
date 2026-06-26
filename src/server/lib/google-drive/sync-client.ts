import type { PrismaClient, TopicSpaceDriveSync } from "@prisma/client";
import type { drive_v3 } from "googleapis";
import { getGoogleDriveClientForUser } from "./user-oauth";

export async function getDriveClientForTopicSpaceSync(
  db: PrismaClient,
  driveSync: TopicSpaceDriveSync,
): Promise<drive_v3.Drive> {
  const userId = driveSync.configuredByUserId;
  if (!userId) {
    throw new Error(
      "Drive 同期の設定者が未登録です。Drive を連携してフォルダを選び直してください。",
    );
  }

  return getGoogleDriveClientForUser(db, userId);
}

export async function isDriveSyncAvailable(
  db: PrismaClient,
  driveSync?: Pick<TopicSpaceDriveSync, "configuredByUserId"> | null,
): Promise<boolean> {
  if (!driveSync?.configuredByUserId) return false;

  const connection = await db.userGoogleDriveConnection.findUnique({
    where: { userId: driveSync.configuredByUserId },
    select: { id: true },
  });
  return Boolean(connection);
}
