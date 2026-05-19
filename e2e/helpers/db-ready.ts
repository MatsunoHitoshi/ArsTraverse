import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function isIntegrationDatabaseReady(): boolean {
  return existsSync(path.resolve(__dirname, "../.db-ready"));
}
