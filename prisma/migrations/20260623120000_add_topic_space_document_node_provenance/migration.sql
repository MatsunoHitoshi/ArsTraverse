-- CreateTable
CREATE TABLE "TopicSpaceDocumentNodeProvenance" (
    "id" TEXT NOT NULL,
    "topicSpaceId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "graphNodeId" TEXT NOT NULL,
    "localNodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicSpaceDocumentNodeProvenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicSpaceDocumentNodeProvenance_topicSpaceId_sourceDocumen_idx" ON "TopicSpaceDocumentNodeProvenance"("topicSpaceId", "sourceDocumentId");

-- CreateIndex
CREATE INDEX "TopicSpaceDocumentNodeProvenance_topicSpaceId_graphNodeId_idx" ON "TopicSpaceDocumentNodeProvenance"("topicSpaceId", "graphNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicSpaceDocumentNodeProvenance_topicSpaceId_sourceDocumen_key" ON "TopicSpaceDocumentNodeProvenance"("topicSpaceId", "sourceDocumentId", "localNodeId");

-- AddForeignKey
ALTER TABLE "TopicSpaceDocumentNodeProvenance" ADD CONSTRAINT "TopicSpaceDocumentNodeProvenance_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
