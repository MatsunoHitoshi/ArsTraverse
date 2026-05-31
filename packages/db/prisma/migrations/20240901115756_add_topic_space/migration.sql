-- CreateEnum
CREATE TYPE "GraphDataStatus" AS ENUM ('PROCESSING', 'CREATED', 'CREATION_FAILED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CREATED_TOPIC_SPACE', 'CREATED_SOURCE_DOCUMENT', 'RECEIVED_NEW_DOCUMENT', 'RECEIVED_SUGGESTION', 'ADD_NEW_DOCUMENT', 'DETACHED_DOCUMENT', 'APPROVED_NEW_DOCUMENT', 'APPROVED_SUGGESTION');

-- CreateTable
CREATE TABLE "TopicSpace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "graphData" JSONB,
    "graphDataStatus" "GraphDataStatus" NOT NULL DEFAULT 'PROCESSING',
    "description" TEXT,
    "image" TEXT,
    "star" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "topicSpaceId" TEXT NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SourceDocumentToTopicSpace" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_SourceDocumentToTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_TopicSpaceToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_TagsToTopicSpace" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_SourceDocumentToTopicSpace_AB_unique" ON "_SourceDocumentToTopicSpace"("A", "B");

-- CreateIndex
CREATE INDEX "_SourceDocumentToTopicSpace_B_index" ON "_SourceDocumentToTopicSpace"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_SourceDocumentToTags_AB_unique" ON "_SourceDocumentToTags"("A", "B");

-- CreateIndex
CREATE INDEX "_SourceDocumentToTags_B_index" ON "_SourceDocumentToTags"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TopicSpaceToUser_AB_unique" ON "_TopicSpaceToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_TopicSpaceToUser_B_index" ON "_TopicSpaceToUser"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TagsToTopicSpace_AB_unique" ON "_TagsToTopicSpace"("A", "B");

-- CreateIndex
CREATE INDEX "_TagsToTopicSpace_B_index" ON "_TagsToTopicSpace"("B");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SourceDocumentToTopicSpace" ADD CONSTRAINT "_SourceDocumentToTopicSpace_A_fkey" FOREIGN KEY ("A") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SourceDocumentToTopicSpace" ADD CONSTRAINT "_SourceDocumentToTopicSpace_B_fkey" FOREIGN KEY ("B") REFERENCES "TopicSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SourceDocumentToTags" ADD CONSTRAINT "_SourceDocumentToTags_A_fkey" FOREIGN KEY ("A") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SourceDocumentToTags" ADD CONSTRAINT "_SourceDocumentToTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TopicSpaceToUser" ADD CONSTRAINT "_TopicSpaceToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "TopicSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TopicSpaceToUser" ADD CONSTRAINT "_TopicSpaceToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagsToTopicSpace" ADD CONSTRAINT "_TagsToTopicSpace_A_fkey" FOREIGN KEY ("A") REFERENCES "Tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagsToTopicSpace" ADD CONSTRAINT "_TagsToTopicSpace_B_fkey" FOREIGN KEY ("B") REFERENCES "TopicSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
