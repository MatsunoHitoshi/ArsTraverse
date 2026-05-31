/*
  Warnings:

  - You are about to drop the `Tags` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_SourceDocumentToTags` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_TagsToTopicSpace` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_SourceDocumentToTags" DROP CONSTRAINT "_SourceDocumentToTags_A_fkey";

-- DropForeignKey
ALTER TABLE "_SourceDocumentToTags" DROP CONSTRAINT "_SourceDocumentToTags_B_fkey";

-- DropForeignKey
ALTER TABLE "_TagsToTopicSpace" DROP CONSTRAINT "_TagsToTopicSpace_A_fkey";

-- DropForeignKey
ALTER TABLE "_TagsToTopicSpace" DROP CONSTRAINT "_TagsToTopicSpace_B_fkey";

-- DropTable
DROP TABLE "Tags";

-- DropTable
DROP TABLE "_SourceDocumentToTags";

-- DropTable
DROP TABLE "_TagsToTopicSpace";

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SourceDocumentToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_TagToTopicSpace" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_SourceDocumentToTag_AB_unique" ON "_SourceDocumentToTag"("A", "B");

-- CreateIndex
CREATE INDEX "_SourceDocumentToTag_B_index" ON "_SourceDocumentToTag"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TagToTopicSpace_AB_unique" ON "_TagToTopicSpace"("A", "B");

-- CreateIndex
CREATE INDEX "_TagToTopicSpace_B_index" ON "_TagToTopicSpace"("B");

-- AddForeignKey
ALTER TABLE "_SourceDocumentToTag" ADD CONSTRAINT "_SourceDocumentToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SourceDocumentToTag" ADD CONSTRAINT "_SourceDocumentToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToTopicSpace" ADD CONSTRAINT "_TagToTopicSpace_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TagToTopicSpace" ADD CONSTRAINT "_TagToTopicSpace_B_fkey" FOREIGN KEY ("B") REFERENCES "TopicSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
