-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingHistory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "previousContent" TEXT,
    "currentContent" TEXT NOT NULL,
    "changeDescription" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WritingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_WorkspaceCollaborators" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_WorkspaceReferencedTopicSpaces" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_WorkspaceTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Workspace_userId_idx" ON "Workspace"("userId");

-- CreateIndex
CREATE INDEX "Workspace_status_idx" ON "Workspace"("status");

-- CreateIndex
CREATE INDEX "Workspace_isDeleted_idx" ON "Workspace"("isDeleted");

-- CreateIndex
CREATE INDEX "WritingHistory_workspaceId_idx" ON "WritingHistory"("workspaceId");

-- CreateIndex
CREATE INDEX "WritingHistory_changedById_idx" ON "WritingHistory"("changedById");

-- CreateIndex
CREATE INDEX "WritingHistory_createdAt_idx" ON "WritingHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "_WorkspaceCollaborators_AB_unique" ON "_WorkspaceCollaborators"("A", "B");

-- CreateIndex
CREATE INDEX "_WorkspaceCollaborators_B_index" ON "_WorkspaceCollaborators"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_WorkspaceReferencedTopicSpaces_AB_unique" ON "_WorkspaceReferencedTopicSpaces"("A", "B");

-- CreateIndex
CREATE INDEX "_WorkspaceReferencedTopicSpaces_B_index" ON "_WorkspaceReferencedTopicSpaces"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_WorkspaceTags_AB_unique" ON "_WorkspaceTags"("A", "B");

-- CreateIndex
CREATE INDEX "_WorkspaceTags_B_index" ON "_WorkspaceTags"("B");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingHistory" ADD CONSTRAINT "WritingHistory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritingHistory" ADD CONSTRAINT "WritingHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkspaceCollaborators" ADD CONSTRAINT "_WorkspaceCollaborators_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkspaceCollaborators" ADD CONSTRAINT "_WorkspaceCollaborators_B_fkey" FOREIGN KEY ("B") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkspaceReferencedTopicSpaces" ADD CONSTRAINT "_WorkspaceReferencedTopicSpaces_A_fkey" FOREIGN KEY ("A") REFERENCES "TopicSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkspaceReferencedTopicSpaces" ADD CONSTRAINT "_WorkspaceReferencedTopicSpaces_B_fkey" FOREIGN KEY ("B") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkspaceTags" ADD CONSTRAINT "_WorkspaceTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkspaceTags" ADD CONSTRAINT "_WorkspaceTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
