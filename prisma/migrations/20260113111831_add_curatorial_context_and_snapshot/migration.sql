-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "curatorialContext" JSONB;

-- CreateTable
CREATE TABLE "GraphSnapshot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "graphData" JSONB NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GraphSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GraphSnapshot_workspaceId_idx" ON "GraphSnapshot"("workspaceId");

-- CreateIndex
CREATE INDEX "GraphSnapshot_createdAt_idx" ON "GraphSnapshot"("createdAt");

-- AddForeignKey
ALTER TABLE "GraphSnapshot" ADD CONSTRAINT "GraphSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
