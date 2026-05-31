/*
  Warnings:

  - The `content` column on the `Workspace` table will be changed from the current type to JSONB.
  - This may cause data loss if the current data cannot be properly converted to JSONB.

*/
-- AlterTable
ALTER TABLE "Workspace" ALTER COLUMN "content" TYPE JSONB USING "content"::JSONB;
