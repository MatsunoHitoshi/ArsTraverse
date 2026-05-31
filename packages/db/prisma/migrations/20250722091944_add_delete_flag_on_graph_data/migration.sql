-- AlterTable
ALTER TABLE "GraphNode" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GraphRelationship" ADD COLUMN     "deletedAt" TIMESTAMP(3);
