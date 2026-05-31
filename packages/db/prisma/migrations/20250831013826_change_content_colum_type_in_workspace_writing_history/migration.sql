/*
  Warnings:

  - The `previousContent` column on the `WritingHistory` table will be changed from the current type to JSONB.
  - This may cause data loss if the current data cannot be properly converted to JSONB.
  - The `currentContent` column on the `WritingHistory` table will be changed from the current type to JSONB.
  - This may cause data loss if the current data cannot be properly converted to JSONB.

*/
-- AlterTable
ALTER TABLE "WritingHistory" ALTER COLUMN "previousContent" TYPE JSONB USING "previousContent"::JSONB,
ALTER COLUMN "currentContent" TYPE JSONB USING "currentContent"::JSONB;
