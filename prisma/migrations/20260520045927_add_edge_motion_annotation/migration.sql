-- CreateTable
CREATE TABLE "EdgeMotionAnnotation" (
    "id" TEXT NOT NULL,
    "edgeId" TEXT NOT NULL,
    "topicSpaceId" TEXT NOT NULL,
    "cdtCategory" TEXT NOT NULL,
    "motionConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeMotionAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EdgeMotionAnnotation_topicSpaceId_idx" ON "EdgeMotionAnnotation"("topicSpaceId");

-- CreateIndex
CREATE UNIQUE INDEX "EdgeMotionAnnotation_edgeId_topicSpaceId_key" ON "EdgeMotionAnnotation"("edgeId", "topicSpaceId");
