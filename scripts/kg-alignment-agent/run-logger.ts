import { mkdir, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunEvent, RunEventType } from "./types.js";

export class RunLogger {
  readonly runId: string;
  readonly runDir: string;

  constructor(
    readonly topicSpaceId: string,
    existingRunId?: string,
  ) {
    this.runId =
      existingRunId ??
      `${new Date().toISOString().replace(/[:.]/g, "-")}`;
    this.runDir = path.join(
      process.cwd(),
      ".alignment-runs",
      topicSpaceId,
      this.runId,
    );
  }

  async init() {
    await mkdir(this.runDir, { recursive: true });
  }

  async log(phase: string, type: RunEventType, payload: unknown) {
    const event: RunEvent = {
      timestamp: new Date().toISOString(),
      phase,
      type,
      payload,
    };
    await appendFile(
      path.join(this.runDir, "events.jsonl"),
      `${JSON.stringify(event)}\n`,
      "utf8",
    );
  }

  async writePlan(plan: unknown) {
    await writeFile(
      path.join(this.runDir, "plan.json"),
      JSON.stringify(plan, null, 2),
      "utf8",
    );
  }

  async readPlan<T>(): Promise<T | null> {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(path.join(this.runDir, "plan.json"), "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async writeSummary(markdown: string) {
    await writeFile(path.join(this.runDir, "summary.md"), markdown, "utf8");
  }
}
