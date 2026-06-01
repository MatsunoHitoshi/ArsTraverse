-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'INPUT_SCAN';

-- AlterTable
ALTER TABLE "SourceDocument" ADD COLUMN "sourceImageUrl" TEXT,
ADD COLUMN "ocrMetadata" JSONB;
