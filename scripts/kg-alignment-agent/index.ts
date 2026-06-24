#!/usr/bin/env node
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadConfig } from "./config.js";
import { TopicSpaceMcpClient } from "./mcp-client.js";
import { RunLogger } from "./run-logger.js";
import { runAlignmentAgent } from "./orchestrator.js";

async function main() {
  const config = loadConfig(process.argv.slice(2));

  const mcp = new TopicSpaceMcpClient(
    config.topicSpaceId,
    config.baseUrl,
    config.sessionCookie,
    config.userAuthToken,
    config.accessToken,
  );

  const logger = new RunLogger(config.topicSpaceId, config.resumeRunId);

  try {
    await mcp.connect();
    await runAlignmentAgent(config, mcp, logger);
  } catch (error) {
    await logger.init().catch(() => undefined);
    await logger.log("error", "error", {
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof StreamableHTTPError && error.code === 404) {
      console.error(
        `TopicSpace が見つかりません: ${config.topicSpaceId}\n` +
          "ID の typo（末尾の文字欠落など）を確認してください。",
      );
    } else {
      console.error(error);
    }
    process.exit(1);
  } finally {
    await mcp.close().catch(() => undefined);
  }
}

main();
