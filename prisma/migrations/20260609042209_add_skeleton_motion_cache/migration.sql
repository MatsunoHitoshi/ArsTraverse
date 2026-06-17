-- CreateTable
CREATE TABLE "SkeletonMotionCache" (
    "id" TEXT NOT NULL,
    "edgeId" TEXT NOT NULL,
    "topicSpaceId" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'momask',
    "skeletonJson" JSONB NOT NULL,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkeletonMotionCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkeletonMotionCache_topicSpaceId_idx" ON "SkeletonMotionCache"("topicSpaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SkeletonMotionCache_edgeId_topicSpaceId_promptHash_model_key" ON "SkeletonMotionCache"("edgeId", "topicSpaceId", "promptHash", "model");
