-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "GraphNode" ADD COLUMN     "transEEmbedding" vector(50);

-- AlterTable
ALTER TABLE "GraphRelationship" ADD COLUMN     "transEEmbedding" vector(50);

-- CreateTable
CREATE TABLE "GraphEmbeddingQueue" (
    "id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "processedEpochs" INTEGER DEFAULT 0,
    "modelStatePath" TEXT,
    "topicSpaceId" TEXT NOT NULL,

    CONSTRAINT "GraphEmbeddingQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GraphEmbeddingQueue_status_idx" ON "GraphEmbeddingQueue"("status");

-- CreateIndex
CREATE INDEX "GraphEmbeddingQueue_topicSpaceId_idx" ON "GraphEmbeddingQueue"("topicSpaceId");

-- AddForeignKey
ALTER TABLE "GraphEmbeddingQueue" ADD CONSTRAINT "GraphEmbeddingQueue_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
