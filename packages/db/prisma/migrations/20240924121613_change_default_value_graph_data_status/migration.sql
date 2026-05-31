-- AlterTable
ALTER TABLE "GraphFusionQueue" ALTER COLUMN "status" SET DEFAULT 'QUEUED';

-- AlterTable
ALTER TABLE "TopicSpace" ALTER COLUMN "graphDataStatus" SET DEFAULT 'QUEUED';
