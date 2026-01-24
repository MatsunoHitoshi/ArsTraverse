/*
  Warnings:

  - You are about to drop the `GraphSnapshot` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GraphSnapshot" DROP CONSTRAINT "GraphSnapshot_workspaceId_fkey";

-- DropTable
DROP TABLE "GraphSnapshot";

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "referencedTopicSpaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaGraphNode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "storyId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "hasExternalConnections" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MetaGraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaGraphRelationship" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "storyId" TEXT NOT NULL,
    "fromMetaNodeId" TEXT NOT NULL,
    "toMetaNodeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MetaGraphRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunitySummary" (
    "id" TEXT NOT NULL,
    "metaNodeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "order" INTEGER,
    "transitionText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunitySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityStory" (
    "id" TEXT NOT NULL,
    "metaNodeId" TEXT NOT NULL,
    "story" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CommunityMembers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Story_workspaceId_key" ON "Story"("workspaceId");

-- CreateIndex
CREATE INDEX "Story_workspaceId_idx" ON "Story"("workspaceId");

-- CreateIndex
CREATE INDEX "Story_referencedTopicSpaceId_idx" ON "Story"("referencedTopicSpaceId");

-- CreateIndex
CREATE INDEX "Story_createdAt_idx" ON "Story"("createdAt");

-- CreateIndex
CREATE INDEX "MetaGraphNode_storyId_idx" ON "MetaGraphNode"("storyId");

-- CreateIndex
CREATE INDEX "MetaGraphNode_communityId_idx" ON "MetaGraphNode"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaGraphNode_storyId_communityId_key" ON "MetaGraphNode"("storyId", "communityId");

-- CreateIndex
CREATE INDEX "MetaGraphRelationship_storyId_idx" ON "MetaGraphRelationship"("storyId");

-- CreateIndex
CREATE INDEX "MetaGraphRelationship_fromMetaNodeId_idx" ON "MetaGraphRelationship"("fromMetaNodeId");

-- CreateIndex
CREATE INDEX "MetaGraphRelationship_toMetaNodeId_idx" ON "MetaGraphRelationship"("toMetaNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunitySummary_metaNodeId_key" ON "CommunitySummary"("metaNodeId");

-- CreateIndex
CREATE INDEX "CommunitySummary_metaNodeId_idx" ON "CommunitySummary"("metaNodeId");

-- CreateIndex
CREATE INDEX "CommunitySummary_order_idx" ON "CommunitySummary"("order");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityStory_metaNodeId_key" ON "CommunityStory"("metaNodeId");

-- CreateIndex
CREATE INDEX "CommunityStory_metaNodeId_idx" ON "CommunityStory"("metaNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "_CommunityMembers_AB_unique" ON "_CommunityMembers"("A", "B");

-- CreateIndex
CREATE INDEX "_CommunityMembers_B_index" ON "_CommunityMembers"("B");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_referencedTopicSpaceId_fkey" FOREIGN KEY ("referencedTopicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaGraphNode" ADD CONSTRAINT "MetaGraphNode_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaGraphRelationship" ADD CONSTRAINT "MetaGraphRelationship_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaGraphRelationship" ADD CONSTRAINT "MetaGraphRelationship_fromMetaNodeId_fkey" FOREIGN KEY ("fromMetaNodeId") REFERENCES "MetaGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaGraphRelationship" ADD CONSTRAINT "MetaGraphRelationship_toMetaNodeId_fkey" FOREIGN KEY ("toMetaNodeId") REFERENCES "MetaGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunitySummary" ADD CONSTRAINT "CommunitySummary_metaNodeId_fkey" FOREIGN KEY ("metaNodeId") REFERENCES "MetaGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityStory" ADD CONSTRAINT "CommunityStory_metaNodeId_fkey" FOREIGN KEY ("metaNodeId") REFERENCES "MetaGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CommunityMembers" ADD CONSTRAINT "_CommunityMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "GraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CommunityMembers" ADD CONSTRAINT "_CommunityMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "MetaGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
