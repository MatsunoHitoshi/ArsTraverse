-- AlterTable
ALTER TABLE "User" ADD COLUMN "uiLocale" TEXT DEFAULT 'ja',
ADD COLUMN "localeLinked" BOOLEAN NOT NULL DEFAULT true;
