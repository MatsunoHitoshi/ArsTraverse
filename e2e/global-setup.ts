import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../.env") });

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "[e2e] DATABASE_URL is not set. integration tests will be skipped.",
    );
    return;
  }

  const db = new PrismaClient();
  const readyFlagPath = path.resolve(__dirname, ".db-ready");
  try {
    await db.$queryRaw`SELECT 1`;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(readyFlagPath, "1", "utf8");
  } catch (error) {
    const { unlinkSync } = await import("node:fs");
    try {
      unlinkSync(readyFlagPath);
    } catch {
      // ignore
    }
    console.warn(
      "[e2e] Database is not reachable. integration tests will be skipped.",
      error instanceof Error ? error.message : error,
    );
  } finally {
    await db.$disconnect();
  }
}
