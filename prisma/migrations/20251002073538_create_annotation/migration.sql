-- CreateEnum
CREATE TYPE "AnnotationType" AS ENUM ('COMMENT', 'INTERPRETATION', 'QUESTION', 'CLARIFICATION', 'CRITICISM', 'SUPPORT');

-- CreateEnum
CREATE TYPE "AnnotationChangeType" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'TYPE_CHANGED');

-- CreateEnum
CREATE TYPE "DiscussionStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'ARCHIVED', 'CONTROVERSIAL');

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "content" JSONB,
    "type" "AnnotationType" NOT NULL DEFAULT 'COMMENT',
    "targetNodeId" TEXT,
    "targetRelationshipId" TEXT,
    "authorId" TEXT NOT NULL,
    "parentAnnotationId" TEXT,
    "sourceDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnotationHistory" (
    "id" TEXT NOT NULL,
    "annotationId" TEXT NOT NULL,
    "changeType" "AnnotationChangeType" NOT NULL,
    "previousContent" JSONB,
    "currentContent" JSONB,
    "previousType" "AnnotationType",
    "currentType" "AnnotationType",
    "changeReason" TEXT,
    "changeComment" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnotationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnotationDiscussion" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "status" "DiscussionStatus" NOT NULL DEFAULT 'ACTIVE',
    "rootAnnotationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnotationDiscussion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DiscussionParticipants" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_DiscussionTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Annotation_targetNodeId_idx" ON "Annotation"("targetNodeId");

-- CreateIndex
CREATE INDEX "Annotation_targetRelationshipId_idx" ON "Annotation"("targetRelationshipId");

-- CreateIndex
CREATE INDEX "Annotation_authorId_idx" ON "Annotation"("authorId");

-- CreateIndex
CREATE INDEX "Annotation_parentAnnotationId_idx" ON "Annotation"("parentAnnotationId");

-- CreateIndex
CREATE INDEX "Annotation_sourceDocumentId_idx" ON "Annotation"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "Annotation_createdAt_idx" ON "Annotation"("createdAt");

-- CreateIndex
CREATE INDEX "AnnotationHistory_annotationId_idx" ON "AnnotationHistory"("annotationId");

-- CreateIndex
CREATE INDEX "AnnotationHistory_changedById_idx" ON "AnnotationHistory"("changedById");

-- CreateIndex
CREATE INDEX "AnnotationHistory_createdAt_idx" ON "AnnotationHistory"("createdAt");

-- CreateIndex
CREATE INDEX "AnnotationDiscussion_rootAnnotationId_idx" ON "AnnotationDiscussion"("rootAnnotationId");

-- CreateIndex
CREATE INDEX "AnnotationDiscussion_status_idx" ON "AnnotationDiscussion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "_DiscussionParticipants_AB_unique" ON "_DiscussionParticipants"("A", "B");

-- CreateIndex
CREATE INDEX "_DiscussionParticipants_B_index" ON "_DiscussionParticipants"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_DiscussionTags_AB_unique" ON "_DiscussionTags"("A", "B");

-- CreateIndex
CREATE INDEX "_DiscussionTags_B_index" ON "_DiscussionTags"("B");

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "GraphNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_targetRelationshipId_fkey" FOREIGN KEY ("targetRelationshipId") REFERENCES "GraphRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_parentAnnotationId_fkey" FOREIGN KEY ("parentAnnotationId") REFERENCES "Annotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationHistory" ADD CONSTRAINT "AnnotationHistory_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "Annotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationHistory" ADD CONSTRAINT "AnnotationHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationDiscussion" ADD CONSTRAINT "AnnotationDiscussion_rootAnnotationId_fkey" FOREIGN KEY ("rootAnnotationId") REFERENCES "Annotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiscussionParticipants" ADD CONSTRAINT "_DiscussionParticipants_A_fkey" FOREIGN KEY ("A") REFERENCES "AnnotationDiscussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiscussionParticipants" ADD CONSTRAINT "_DiscussionParticipants_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiscussionTags" ADD CONSTRAINT "_DiscussionTags_A_fkey" FOREIGN KEY ("A") REFERENCES "AnnotationDiscussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DiscussionTags" ADD CONSTRAINT "_DiscussionTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
