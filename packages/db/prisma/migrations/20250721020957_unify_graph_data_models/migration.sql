CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "GraphNode" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "nameEmbedding" vector(1536),
    "documentGraphId" TEXT,
    "topicSpaceId" TEXT,

    CONSTRAINT "GraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphRelationship" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "documentGraphId" TEXT,
    "topicSpaceId" TEXT,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,

    CONSTRAINT "GraphRelationship_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GraphNode" ADD CONSTRAINT "GraphNode_documentGraphId_fkey" FOREIGN KEY ("documentGraphId") REFERENCES "DocumentGraph"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphNode" ADD CONSTRAINT "GraphNode_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphRelationship" ADD CONSTRAINT "GraphRelationship_documentGraphId_fkey" FOREIGN KEY ("documentGraphId") REFERENCES "DocumentGraph"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphRelationship" ADD CONSTRAINT "GraphRelationship_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphRelationship" ADD CONSTRAINT "GraphRelationship_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "GraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphRelationship" ADD CONSTRAINT "GraphRelationship_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "GraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
