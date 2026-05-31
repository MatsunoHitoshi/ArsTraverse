/*
  Warnings:

  - You are about to drop the column `sourceGraphId` on the `GraphFusionQueue` table. All the data in the column will be lost.
  - You are about to drop the column `targetGraphId` on the `GraphFusionQueue` table. All the data in the column will be lost.
  - Added the required column `additionalGraphId` to the `GraphFusionQueue` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "GraphFusionQueue" DROP CONSTRAINT "GraphFusionQueue_sourceGraphId_fkey";

-- DropForeignKey
ALTER TABLE "GraphFusionQueue" DROP CONSTRAINT "GraphFusionQueue_targetGraphId_fkey";

-- AlterTable
ALTER TABLE "GraphFusionQueue" DROP COLUMN "sourceGraphId",
DROP COLUMN "targetGraphId",
ADD COLUMN     "additionalGraphId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "GraphFusionQueue" ADD CONSTRAINT "GraphFusionQueue_additionalGraphId_fkey" FOREIGN KEY ("additionalGraphId") REFERENCES "DocumentGraph"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
