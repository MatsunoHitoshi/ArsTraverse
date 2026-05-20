import { config as loadDotenv } from "dotenv";
import type { AgentConfig } from "./types.js";

loadDotenv();

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;

    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      const key = body.slice(0, eq);
      const value = body.slice(eq + 1);
      if (key) {
        args[key] = value.length > 0 ? value : true;
      }
      continue;
    }

    const key = body;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function printHelp() {
  console.log(`KG Alignment Agent

Usage:
  npm run kg:align -- --topic-space-id=<id> [options]

Options:
  --topic-space-id   (required) Target TopicSpace ID
  --base-url         API base URL (default: ALIGNMENT_AGENT_BASE_URL or http://localhost:3000)
  --dry-run          Scan and plan only; no draft mutations or submit
  --with-context     Fetch MCP contextual descriptions for low-confidence merges
  --resume <runId>   Resume from a previous run (checkpoint B onward)
  --model <name>     OpenAI model override (default: gpt-4o-mini)
  --no-submit        Create draft and apply changes but do not submit proposal
  --help             Show this help

Environment:
  ALIGNMENT_AGENT_SESSION_COOKIE   (required for writes) next-auth session cookie
  ALIGNMENT_AGENT_USER_AUTH_TOKEN  (optional) embedding search token
  ALIGNMENT_AGENT_BASE_URL
  ALIGNMENT_AGENT_MODEL
  OPENAI_API_KEY                   (required for plan generation)
`);
}

export function loadConfig(argv: string[]): AgentConfig {
  const args = parseArgs(argv);

  if (args.help === true) {
    printHelp();
    process.exit(0);
  }

  const topicSpaceId = String(args["topic-space-id"] ?? "");
  if (!topicSpaceId) {
    printHelp();
    throw new Error("--topic-space-id is required");
  }

  const sessionCookie =
    process.env.ALIGNMENT_AGENT_SESSION_COOKIE?.trim() ?? "";
  if (!sessionCookie && args["dry-run"] !== true) {
    console.warn(
      "警告: ALIGNMENT_AGENT_SESSION_COOKIE が未設定です。書き込みツールは失敗する可能性があります。",
    );
  }

  return {
    topicSpaceId,
    baseUrl:
      (typeof args["base-url"] === "string" ? args["base-url"] : undefined) ??
      process.env.ALIGNMENT_AGENT_BASE_URL ??
      "http://localhost:3000",
    sessionCookie,
    userAuthToken: process.env.ALIGNMENT_AGENT_USER_AUTH_TOKEN?.trim(),
    model:
      (typeof args.model === "string" ? args.model : undefined) ??
      process.env.ALIGNMENT_AGENT_MODEL ??
      "gpt-4o-mini",
    dryRun: args["dry-run"] === true,
    withContext: args["with-context"] === true,
    resumeRunId:
      typeof args.resume === "string" ? args.resume : undefined,
    submit: args["no-submit"] !== true,
  };
}
