-- CreateEnum
CREATE TYPE "KgExtractionPhase" AS ENUM ('PHASE1', 'PHASE2', 'FINALIZE');

-- CreateTable
CREATE TABLE "KgExtractionJob" (
    "id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "phase" "KgExtractionPhase" NOT NULL DEFAULT 'PHASE1',
    "userId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "topicSpaceId" TEXT,
    "plainText" TEXT NOT NULL,
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "processedChunks" INTEGER NOT NULL DEFAULT 0,
    "batchSize" INTEGER NOT NULL DEFAULT 3,
    "contextSnapshot" TEXT,
    "accumulatedNodes" JSONB,
    "accumulatedRelationships" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KgExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KgExtractionJob_status_createdAt_idx" ON "KgExtractionJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "KgExtractionJob_sourceDocumentId_idx" ON "KgExtractionJob"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "KgExtractionJob_topicSpaceId_idx" ON "KgExtractionJob"("topicSpaceId");

-- AddForeignKey
ALTER TABLE "KgExtractionJob" ADD CONSTRAINT "KgExtractionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KgExtractionJob" ADD CONSTRAINT "KgExtractionJob_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KgExtractionJob" ADD CONSTRAINT "KgExtractionJob_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
