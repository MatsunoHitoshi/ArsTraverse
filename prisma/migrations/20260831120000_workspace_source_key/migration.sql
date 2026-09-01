-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "source" TEXT,
ADD COLUMN "sourceKey" TEXT;

-- CreateIndex
CREATE INDEX "Workspace_source_idx" ON "Workspace"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_source_sourceKey_key" ON "Workspace"("source", "sourceKey");
