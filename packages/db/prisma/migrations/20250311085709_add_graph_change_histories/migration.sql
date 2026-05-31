-- CreateEnum
CREATE TYPE "GraphChangeRecordType" AS ENUM ('DOCUMENT_GRAPH', 'TOPIC_SPACE');

-- CreateEnum
CREATE TYPE "GraphChangeType" AS ENUM ('ADD', 'REMOVE', 'UPDATE');

-- CreateEnum
CREATE TYPE "GraphChangeEntityType" AS ENUM ('NODE', 'EDGE');

-- CreateTable
CREATE TABLE "GraphChangeHistory" (
    "id" TEXT NOT NULL,
    "recordType" "GraphChangeRecordType" NOT NULL,
    "recordId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GraphChangeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeLinkChangeHistory" (
    "id" TEXT NOT NULL,
    "changeType" "GraphChangeType" NOT NULL,
    "changeEntityType" "GraphChangeEntityType" NOT NULL,
    "changeEntityId" TEXT NOT NULL,
    "previousState" JSONB NOT NULL,
    "nextState" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "graphChangeHistoryId" TEXT NOT NULL,

    CONSTRAINT "NodeLinkChangeHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GraphChangeHistory" ADD CONSTRAINT "GraphChangeHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeLinkChangeHistory" ADD CONSTRAINT "NodeLinkChangeHistory_graphChangeHistoryId_fkey" FOREIGN KEY ("graphChangeHistoryId") REFERENCES "GraphChangeHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
