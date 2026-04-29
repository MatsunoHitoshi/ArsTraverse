/**
 * メタグラフ community 層の戦略比較ベンチ（DB・認証・LLM なし）。
 * 使用例: npx tsx scripts/meta-graph-strategy-benchmark.ts --fixture experiments/fixtures/smoke
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  ClusterStrategyId,
  ClusterStrategySection,
  HybridSectionMappingContext,
  MetaGraphGraphDoc,
  MetaGraphStrategiesInput,
  SectionMapStrategyId,
} from "../src/server/lib/meta-graph-strategies/types";
import {
  CLUSTER_STRATEGY_IDS,
  SECTION_MAP_STRATEGY_IDS,
} from "../src/server/lib/meta-graph-strategies/types";
import {
  compareNodeToCommunity,
  serializeCommunityAssignmentResult,
} from "../src/server/lib/meta-graph-strategies/experiment/compare-community-assignments";
import { runCommunityAssignment } from "../src/server/lib/meta-graph-strategies/run-community-assignment";

interface FixtureInput {
  graphDocument: MetaGraphGraphDoc;
  sections: ClusterStrategySection[];
  nodeNameEmbeddings?: Record<string, number[]>;
  hybridContext?: {
    sectionEmbeddingVectors: number[][];
    weights?: { seed: number; semantic: number };
    semanticThreshold?: number;
  };
  clusterOptions?: MetaGraphStrategiesInput["clusterOptions"];
}

function parseArgs(argv: string[]) {
  let fixturePath = "";
  let strategiesArg: string | undefined;
  let baselineArg = "louvain-unweighted/seed-max-count";
  let outDir: string | undefined;
  let requireEmbeddings = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixture" && argv[i + 1]) {
      fixturePath = argv[++i]!;
      continue;
    }
    if (a === "--strategies" && argv[i + 1]) {
      strategiesArg = argv[++i]!;
      continue;
    }
    if (a === "--baseline" && argv[i + 1]) {
      baselineArg = argv[++i]!;
      continue;
    }
    if (a === "--out" && argv[i + 1]) {
      outDir = argv[++i]!;
      continue;
    }
    if (a === "--require-embeddings") {
      requireEmbeddings = true;
      continue;
    }
  }

  return {
    fixturePath,
    strategiesArg,
    baselineArg,
    outDir,
    requireEmbeddings,
  };
}

function resolveInputJson(fixturePath: string): string {
  const abs = path.isAbsolute(fixturePath)
    ? fixturePath
    : path.join(process.cwd(), fixturePath);
  return abs.endsWith(".json") ? abs : path.join(abs, "input.json");
}

function parseStrategyPairs(
  arg: string | undefined,
): Array<{ cluster: ClusterStrategyId; section: SectionMapStrategyId }> {
  if (!arg) {
    const pairs: Array<{
      cluster: ClusterStrategyId;
      section: SectionMapStrategyId;
    }> = [];
    for (const cluster of CLUSTER_STRATEGY_IDS) {
      for (const section of SECTION_MAP_STRATEGY_IDS) {
        pairs.push({ cluster, section });
      }
    }
    return pairs;
  }
  const pairs: Array<{
    cluster: ClusterStrategyId;
    section: SectionMapStrategyId;
  }> = [];
  for (const part of arg.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [c, s] = part.split("/");
    if (!c || !s) {
      throw new Error(
        `Invalid strategy pair "${part}". Expected cluster/sectionMap (e.g. louvain-unweighted/seed-max-count).`,
      );
    }
    if (!CLUSTER_STRATEGY_IDS.includes(c as ClusterStrategyId)) {
      throw new Error(`Unknown clusterStrategy: ${c}`);
    }
    if (!SECTION_MAP_STRATEGY_IDS.includes(s as SectionMapStrategyId)) {
      throw new Error(`Unknown sectionMapStrategy: ${s}`);
    }
    pairs.push({
      cluster: c as ClusterStrategyId,
      section: s as SectionMapStrategyId,
    });
  }
  return pairs;
}

function pairKey(cluster: ClusterStrategyId, section: SectionMapStrategyId) {
  return `${cluster}__${section}`;
}

function buildHybridContext(
  fixture: FixtureInput,
): HybridSectionMappingContext | null {
  const emb = fixture.nodeNameEmbeddings;
  const hc = fixture.hybridContext;
  if (!emb || !hc?.sectionEmbeddingVectors?.length) return null;
  return {
    sectionEmbeddingVectors: hc.sectionEmbeddingVectors,
    nodeNameEmbeddings: new Map(Object.entries(emb)),
    weights: hc.weights ?? { seed: 0.45, semantic: 0.55 },
    semanticThreshold: hc.semanticThreshold ?? 1e-3,
  };
}

function needsEmbeddingsForCluster(cluster: ClusterStrategyId): boolean {
  return cluster === "embedding-kmeans-name";
}

function needsHybridData(section: SectionMapStrategyId): boolean {
  return section === "hybrid-seed-embedding";
}

function canRunPair(
  fixture: FixtureInput,
  cluster: ClusterStrategyId,
  section: SectionMapStrategyId,
): { ok: true } | { ok: false; reason: string } {
  const emb = fixture.nodeNameEmbeddings;
  const hasEmb =
    emb && Object.keys(emb).length > 0
      ? true
      : false;

  if (needsEmbeddingsForCluster(cluster) && !hasEmb) {
    return {
      ok: false,
      reason: "embedding-kmeans-name requires nodeNameEmbeddings in fixture",
    };
  }

  if (needsHybridData(section)) {
    const hc = buildHybridContext(fixture);
    if (!hc) {
      return {
        ok: false,
        reason:
          "hybrid-seed-embedding requires nodeNameEmbeddings and hybridContext.sectionEmbeddingVectors",
      };
    }
    if (hc.sectionEmbeddingVectors.length !== fixture.sections.length) {
      return {
        ok: false,
        reason: `hybrid sectionEmbeddingVectors length (${hc.sectionEmbeddingVectors.length}) must match sections length (${fixture.sections.length})`,
      };
    }
  }

  return { ok: true };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.fixturePath) {
    console.error(
      "Usage: tsx scripts/meta-graph-strategy-benchmark.ts --fixture <dir|input.json> [--strategies cluster/section,...] [--baseline cluster/section] [--out dir] [--require-embeddings]",
    );
    process.exit(1);
  }

  const inputPath = resolveInputJson(args.fixturePath);
  const raw = JSON.parse(await readFile(inputPath, "utf8")) as FixtureInput;
  if (!raw.graphDocument?.nodes || !raw.sections) {
    throw new Error("Invalid fixture: graphDocument and sections are required");
  }

  const pairs = parseStrategyPairs(args.strategiesArg);
  const baselineParts = args.baselineArg.split("/");
  if (baselineParts.length !== 2) {
    throw new Error("--baseline must be cluster/sectionMap");
  }
  const baselineCluster = baselineParts[0]! as ClusterStrategyId;
  const baselineSection = baselineParts[1]! as SectionMapStrategyId;
  const baselineKey = pairKey(baselineCluster, baselineSection);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outRoot =
    args.outDir ??
    path.join(process.cwd(), "experiments", "out", `run-${timestamp}`);
  await mkdir(outRoot, { recursive: true });

  const meta: Record<string, unknown> = {
    fixturePath: inputPath,
    baseline: args.baselineArg,
    generatedAt: new Date().toISOString(),
    skipped: [] as string[],
  };

  const results = new Map<
    string,
    ReturnType<typeof serializeCommunityAssignmentResult>
  >();

  for (const { cluster, section } of pairs) {
    const key = pairKey(cluster, section);
    const check = canRunPair(raw, cluster, section);
    if (!check.ok) {
      const msg = `${key}: skipped (${check.reason})`;
      (meta.skipped as string[]).push(msg);
      console.warn(msg);
      if (args.requireEmbeddings) {
        console.error("Failing due to --require-embeddings:", check.reason);
        process.exit(1);
      }
      continue;
    }

    const hybridContext =
      section === "hybrid-seed-embedding" ? buildHybridContext(raw) : null;

    const embMap =
      raw.nodeNameEmbeddings &&
      Object.keys(raw.nodeNameEmbeddings).length > 0
        ? new Map(Object.entries(raw.nodeNameEmbeddings))
        : undefined;

    const strategies: MetaGraphStrategiesInput = {
      clusterStrategy: cluster,
      sectionMapStrategy: section,
      clusterOptions: raw.clusterOptions,
    };

    const clusterStrategyContext = {
      nodeNameEmbeddings: embMap,
      maxK: raw.clusterOptions?.maxK,
      labelPropagationIterations: raw.clusterOptions?.labelPropagationIterations,
      randomSeed: raw.clusterOptions?.randomSeed,
    };

    const assignment = runCommunityAssignment(raw.graphDocument, raw.sections, {
      strategies,
      hybridContext,
      clusterStrategyContext,
    });

    const serialized = serializeCommunityAssignmentResult(assignment);
    results.set(key, serialized);
    await writeFile(
      path.join(outRoot, `${key}.json`),
      JSON.stringify(
        {
          strategies: { cluster, section },
          result: serialized,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  const baselineSerialized =
    results.get(baselineKey) ?? [...results.values()][0] ?? null;
  if (!results.get(baselineKey) && baselineSerialized) {
    meta.warning = `Baseline ${baselineKey} was not run (skipped or missing). Comparison uses first available result.`;
  }

  const summaryRows: string[] = [
    "strategyKey,exactAgreementRate,comparedNodeCount,distinctCommunitiesBaseline,distinctCommunitiesOther",
  ];

  let md = `# Meta-graph strategy benchmark\n\n`;
  md += `- Fixture: \`${inputPath}\`\n`;
  md += `- Baseline: \`${args.baselineArg}\`\n`;
  md += `- Output: \`${outRoot}\`\n\n`;

  if (!baselineSerialized) {
    md += `No successful runs.\n`;
  } else {
    md += `## Agreement vs baseline (node-wise communityId)\n\n`;
    md += `| strategy | agreement | compared nodes | distinct (this) |\n`;
    md += `|----------|-----------|----------------|-------------------|\n`;

    const baselineNc = baselineSerialized.nodeToCommunity;

    for (const [key, ser] of results) {
      const cmp = compareNodeToCommunity(baselineNc, ser.nodeToCommunity);
      summaryRows.push(
        `${key},${cmp.exactAgreementRate.toFixed(6)},${cmp.comparedNodeCount},${cmp.distinctCommunitiesBaseline},${cmp.distinctCommunitiesOther}`,
      );
      md += `| ${key} | ${(cmp.exactAgreementRate * 100).toFixed(2)}% | ${cmp.comparedNodeCount} | ${cmp.distinctCommunitiesOther} |\n`;
    }
  }

  await writeFile(path.join(outRoot, "summary.csv"), summaryRows.join("\n"), "utf8");
  await writeFile(path.join(outRoot, "summary.md"), md, "utf8");
  await writeFile(
    path.join(outRoot, "meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );

  console.log(`Wrote results under ${outRoot}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
