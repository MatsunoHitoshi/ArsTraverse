-- CreateTable
CREATE TABLE "TopicSpaceDocumentEdgeProvenance" (
    "id" TEXT NOT NULL,
    "topicSpaceId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "graphRelationshipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicSpaceDocumentEdgeProvenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicSpaceDocumentEdgeProvenance_topicSpaceId_sourceDocumen_idx" ON "TopicSpaceDocumentEdgeProvenance"("topicSpaceId", "sourceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicSpaceDocumentEdgeProvenance_topicSpaceId_sourceDocumen_key" ON "TopicSpaceDocumentEdgeProvenance"("topicSpaceId", "sourceDocumentId", "graphRelationshipId");

-- AddForeignKey
ALTER TABLE "TopicSpaceDocumentEdgeProvenance" ADD CONSTRAINT "TopicSpaceDocumentEdgeProvenance_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
