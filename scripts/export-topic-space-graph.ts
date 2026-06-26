#!/usr/bin/env tsx
/**
 * TopicSpace グラフを DB から直接エクスポート（MCP get_topic_space_graph と同形式）。
 *
 * Usage:
 *   npm run export:topic-space -- --topic-space-id=<id> [--out=path.json]
 *
 * Environment:
 *   DATABASE_URL (required)
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { mcpGetTopicSpaceGraph } from "../src/server/mcp/platform-handlers";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      args[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
      args[body] = argv[++i]!;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const topicSpaceId = args["topic-space-id"]?.trim();
  const outPath = args.out?.trim();
  const userId = args["user-id"]?.trim();

  if (!topicSpaceId) {
    console.error("Usage: npm run export:topic-space -- --topic-space-id=<id> [--out=file.json] [--user-id=<adminUserId>]");
    process.exit(1);
  }

  const db = new PrismaClient();
  try {
    let adminUserId = userId;
    if (!adminUserId) {
      const topicSpace = await db.topicSpace.findFirst({
        where: { id: topicSpaceId, isDeleted: false },
        include: { admins: { select: { id: true }, take: 1 } },
      });
      adminUserId = topicSpace?.admins[0]?.id;
    }

    if (!adminUserId) {
      throw new Error("TopicSpace 管理者が見つかりません。--user-id を指定してください。");
    }

    const exported = await mcpGetTopicSpaceGraph(
      { db, userId: adminUserId },
      { topicSpaceId },
    );

    const snapshot = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      source: {
        topicSpaceId: exported.topicSpaceId,
        topicSpaceName: exported.topicSpaceName,
        mcpToolIdentifier: exported.mcpToolIdentifier,
        sourceDocumentIds: exported.sourceDocumentIds,
      },
      stats: {
        nodeCount: exported.nodeCount,
        relationshipCount: exported.relationshipCount,
      },
      provenance: exported.provenance,
      nodes: exported.graph.nodes,
      relationships: exported.graph.relationships,
    };

    const json = JSON.stringify(snapshot, null, 2);
    if (outPath) {
      writeFileSync(outPath, json, "utf-8");
      console.log(`Wrote ${outPath} (${exported.nodeCount} nodes, ${exported.relationshipCount} rels)`);
    } else {
      process.stdout.write(json);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
