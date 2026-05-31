-- AlterEnum
ALTER TYPE "GraphDataStatus" ADD VALUE 'QUEUED';

-- AlterTable
ALTER TABLE "TopicSpace" ALTER COLUMN "graphDataStatus" SET DEFAULT 'PROCESSING';

-- CreateTable
CREATE TABLE "GraphFusionQueue" (
    "id" TEXT NOT NULL,
    "status" "GraphDataStatus" NOT NULL,
    "topicSpaceId" TEXT NOT NULL,
    "sourceGraphId" TEXT NOT NULL,
    "targetGraphId" TEXT NOT NULL,

    CONSTRAINT "GraphFusionQueue_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GraphFusionQueue" ADD CONSTRAINT "GraphFusionQueue_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphFusionQueue" ADD CONSTRAINT "GraphFusionQueue_sourceGraphId_fkey" FOREIGN KEY ("sourceGraphId") REFERENCES "DocumentGraph"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphFusionQueue" ADD CONSTRAINT "GraphFusionQueue_targetGraphId_fkey" FOREIGN KEY ("targetGraphId") REFERENCES "DocumentGraph"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
