/*
  Warnings:

  - Added the required column `name` to the `GraphNode` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GraphNode" ADD COLUMN     "name" TEXT NOT NULL;
