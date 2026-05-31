-- AlterTable
ALTER TABLE "DocumentGraph" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SourceDocument" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TopicSpace" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;
