-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('INPUT_PDF', 'INPUT_TXT');

-- AlterTable
ALTER TABLE "SourceDocument" ADD COLUMN     "documentType" "DocumentType" NOT NULL DEFAULT 'INPUT_TXT';
