-- AlterTable
ALTER TABLE "TopicSpace" ADD COLUMN "defaultOcrLanguage" TEXT NOT NULL DEFAULT 'jpn';

-- CreateTable
CREATE TABLE "PdfExtractionJob" (
    "id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "sourceDocumentId" TEXT,
    "topicSpaceId" TEXT,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "driveFileId" TEXT,
    "driveFileName" TEXT,
    "storageUrl" TEXT,
    "pageCount" INTEGER,
    "processedPages" INTEGER NOT NULL DEFAULT 0,
    "detectedLanguage" TEXT,
    "writingDirection" TEXT,
    "directionConfidence" DOUBLE PRECISION,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdfExtractionJob_status_createdAt_idx" ON "PdfExtractionJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PdfExtractionJob_sourceDocumentId_idx" ON "PdfExtractionJob"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "PdfExtractionJob_topicSpaceId_idx" ON "PdfExtractionJob"("topicSpaceId");

-- AddForeignKey
ALTER TABLE "PdfExtractionJob" ADD CONSTRAINT "PdfExtractionJob_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfExtractionJob" ADD CONSTRAINT "PdfExtractionJob_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfExtractionJob" ADD CONSTRAINT "PdfExtractionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
