/**
 * エクスポートした workspace JSON から meta-graph ベンチ用 input.json を生成する。
 *
 *   npx tsx scripts/build-meta-graph-fixture-from-workspace.ts \\
 *     --in experiments/fixtures/first/workspace.json \\
 *     --out experiments/fixtures/first/input.json
 *
 * nodeNameEmbeddings / hybridContext は DB や別手順で付与する想定（このスクリプトでは付けない）。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { JSONContent } from "@tiptap/core";

import { extractSectionsWithSegments } from "../src/app/_utils/text/parse-content-sections";
import type { MetaGraphGraphDoc } from "../src/server/lib/meta-graph-strategies/types";

interface WorkspaceExport {
  content?: JSONContent;
  referencedTopicSpaces?: Array<{
    id: string;
    name?: string;
    graphNodes?: Array<{
      id: string;
      name: string;
      label: string;
      properties?: Record<string, unknown>;
      topicSpaceId?: string;
      documentGraphId?: string | null;
      deletedAt?: string | null;
    }>;
    graphRelationships?: Array<{
      id: string;
      type: string;
      properties?: Record<string, unknown>;
      fromNodeId: string;
      toNodeId: string;
      topicSpaceId?: string;
      documentGraphId?: string | null;
      deletedAt?: string | null;
    }>;
  }>;
}

function parseArgs(argv: string[]) {
  let inputPath = "";
  let outputPath = "";
  let topicSpaceIndex = 0;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--in" && argv[i + 1]) {
      inputPath = argv[++i]!;
      continue;
    }
    if (a === "--out" && argv[i + 1]) {
      outputPath = argv[++i]!;
      continue;
    }
    if (a === "--topic-space-index" && argv[i + 1]) {
      topicSpaceIndex = Number.parseInt(argv[++i]!, 10);
      continue;
    }
  }

  return { inputPath, outputPath, topicSpaceIndex };
}

function toGraphDocument(ts: NonNullable<WorkspaceExport["referencedTopicSpaces"]>[0]): MetaGraphGraphDoc {
  const nodes = (ts.graphNodes ?? [])
    .filter((n) => !n.deletedAt)
    .map((n) => ({
      id: n.id,
      name: n.name,
      label: n.label,
      properties: n.properties ?? {},
    }));

  const relationships = (ts.graphRelationships ?? [])
    .filter((r) => !r.deletedAt)
    .map((r) => ({
      id: r.id,
      type: r.type,
      properties: r.properties ?? {},
      sourceId: r.fromNodeId,
      targetId: r.toNodeId,
    }));

  return { nodes, relationships };
}

async function main() {
  process.env.SKIP_EXTRACT_SECTIONS_LOG = "1";

  const { inputPath, outputPath, topicSpaceIndex } = parseArgs(process.argv);
  if (!inputPath || !outputPath) {
    console.error(
      "Usage: tsx scripts/build-meta-graph-fixture-from-workspace.ts --in <workspace.json> --out <input.json> [--topic-space-index 0]",
    );
    process.exit(1);
  }

  const absIn = path.isAbsolute(inputPath)
    ? inputPath
    : path.join(process.cwd(), inputPath);
  const absOut = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);

  const raw = JSON.parse(await readFile(absIn, "utf8")) as WorkspaceExport;

  const topicSpaces = raw.referencedTopicSpaces ?? [];
  const ts = topicSpaces[topicSpaceIndex];
  if (!ts) {
    console.error(
      `No referencedTopicSpaces[${topicSpaceIndex}] (length=${topicSpaces.length})`,
    );
    process.exit(1);
  }

  const graphDocument = toGraphDocument(ts);
  const contentArray = raw.content?.content;
  if (!Array.isArray(contentArray)) {
    console.error("workspace.content.content is missing or not an array");
    process.exit(1);
  }

  const sections = extractSectionsWithSegments(contentArray);

  if (sections.length === 0) {
    console.error(
      "No sections (Heading2 blocks) found. Add at least one H2 to the document or check content.",
    );
    process.exit(1);
  }

  const fixture = {
    _meta: {
      sourceWorkspace: path.basename(absIn),
      topicSpaceId: ts.id,
      topicSpaceName: ts.name ?? null,
      topicSpaceIndex,
      graphNodeCount: graphDocument.nodes.length,
      graphRelationshipCount: graphDocument.relationships.length,
      sectionCount: sections.length,
      generatedAt: new Date().toISOString(),
    },
    graphDocument,
    sections,
    clusterOptions: {
      maxK: 32,
      labelPropagationIterations: 30,
      randomSeed: 42,
    },
  };

  await mkdir(path.dirname(absOut), { recursive: true });
  await writeFile(absOut, JSON.stringify(fixture, null, 2), "utf8");
  console.log(
    `Wrote ${absOut} (${graphDocument.nodes.length} nodes, ${graphDocument.relationships.length} rels, ${sections.length} sections)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
