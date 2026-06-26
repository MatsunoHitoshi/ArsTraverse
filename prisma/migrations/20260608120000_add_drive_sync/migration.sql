-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'INPUT_DRIVE';

-- AlterTable
ALTER TABLE "SourceDocument" ADD COLUMN "externalSourceId" TEXT,
ADD COLUMN "externalModifiedAt" TIMESTAMP(3),
ADD COLUMN "contentHash" TEXT;

-- CreateIndex
CREATE INDEX "SourceDocument_externalSourceId_idx" ON "SourceDocument"("externalSourceId");

-- CreateTable
CREATE TABLE "TopicSpaceDriveSync" (
    "id" TEXT NOT NULL,
    "topicSpaceId" TEXT NOT NULL,
    "driveFolderId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "recursive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicSpaceDriveSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TopicSpaceDriveSync_topicSpaceId_key" ON "TopicSpaceDriveSync"("topicSpaceId");

-- AddForeignKey
ALTER TABLE "TopicSpaceDriveSync" ADD CONSTRAINT "TopicSpaceDriveSync_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
