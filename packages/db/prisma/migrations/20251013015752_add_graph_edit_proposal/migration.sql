-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'PENDING', 'IN_REVIEW', 'LOCKED', 'APPROVED', 'REJECTED', 'MERGED', 'CANCELLED');

-- CreateTable
CREATE TABLE "GraphEditProposal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "topicSpaceId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraphEditProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphEditChange" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "changeType" "GraphChangeType" NOT NULL,
    "changeEntityType" "GraphChangeEntityType" NOT NULL,
    "changeEntityId" TEXT NOT NULL,
    "previousState" JSONB NOT NULL,
    "nextState" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphEditChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalComment" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "parentCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProposalComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GraphEditProposal_topicSpaceId_idx" ON "GraphEditProposal"("topicSpaceId");

-- CreateIndex
CREATE INDEX "GraphEditProposal_proposerId_idx" ON "GraphEditProposal"("proposerId");

-- CreateIndex
CREATE INDEX "GraphEditProposal_status_idx" ON "GraphEditProposal"("status");

-- CreateIndex
CREATE INDEX "GraphEditChange_proposalId_idx" ON "GraphEditChange"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalComment_proposalId_idx" ON "ProposalComment"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalComment_authorId_idx" ON "ProposalComment"("authorId");

-- AddForeignKey
ALTER TABLE "GraphEditProposal" ADD CONSTRAINT "GraphEditProposal_topicSpaceId_fkey" FOREIGN KEY ("topicSpaceId") REFERENCES "TopicSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphEditProposal" ADD CONSTRAINT "GraphEditProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphEditProposal" ADD CONSTRAINT "GraphEditProposal_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphEditProposal" ADD CONSTRAINT "GraphEditProposal_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphEditChange" ADD CONSTRAINT "GraphEditChange_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "GraphEditProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "GraphEditProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "ProposalComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
