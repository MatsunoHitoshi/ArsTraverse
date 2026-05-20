import type { TopicSpaceMcpClient } from "./mcp-client.js";
import type { RunLogger } from "./run-logger.js";
import type { AgentConfig, ConfirmedPlan, ScanResult } from "./types.js";
import {
  checkpointCategories,
  checkpointReviewPlan,
  checkpointSubmitDiff,
} from "./checkpoints.js";
import { generateAlignmentPlan } from "./llm-planner.js";

function extractProposalId(text: string): string | null {
  const match = text.match(/proposalId=([^\s]+)/);
  return match?.[1] ?? null;
}

function formatDiffSummary(parsed: unknown): string {
  if (typeof parsed !== "object" || parsed === null) {
    return JSON.stringify(parsed, null, 2);
  }
  const diff = parsed as {
    summary?: unknown;
    nodeChanges?: unknown[];
    edgeChanges?: unknown[];
    hasChanges?: boolean;
    proposal?: { id?: string; title?: string; status?: string };
  };
  const lines = [
    `proposal: ${diff.proposal?.id ?? "?"}`,
    `status: ${diff.proposal?.status ?? "?"}`,
    `hasChanges: ${String(diff.hasChanges)}`,
    `summary: ${JSON.stringify(diff.summary)}`,
    `nodeChanges: ${diff.nodeChanges?.length ?? 0}`,
    `edgeChanges: ${diff.edgeChanges?.length ?? 0}`,
  ];
  return lines.join("\n");
}

export async function runAlignmentAgent(
  config: AgentConfig,
  mcp: TopicSpaceMcpClient,
  logger: RunLogger,
) {
  await logger.init();
  await logger.log("init", "run_started", {
    topicSpaceId: config.topicSpaceId,
    dryRun: config.dryRun,
    model: config.model,
    runId: logger.runId,
  });

  if (config.resumeRunId) {
    const saved = await logger.readPlan<ConfirmedPlan>();
    if (!saved) {
      throw new Error(`plan.json not found for run ${config.resumeRunId}`);
    }
    if (config.dryRun) {
      console.log("Resume + dry-run: saved plan loaded, execute skipped.");
      return;
    }
    await executePlan(config, mcp, logger, saved);
    return;
  }

  const scan = await scanPhase(mcp, logger);

  const categories = await checkpointCategories();
  await logger.log("checkpoint_a", "checkpoint_answered", { categories });

  if (config.dryRun) {
    console.log("\n[dry-run] scan complete. Categories:", categories);
    await logger.writeSummary(
      `# Alignment run (dry-run)\n\n- runId: ${logger.runId}\n- categories: ${categories.join(", ")}\n`,
    );
    await logger.log("finish", "run_finished", { dryRun: true });
    return;
  }

  const contextSnippets: string[] = [];
  if (config.withContext) {
    const exact = scan.exactDuplicateGroups as {
      groups?: Array<{
        nodes: Array<{ id: string; name: string }>;
      }>;
    };
    for (const group of exact.groups?.slice(0, 3) ?? []) {
      const nodeId = group.nodes[0]?.id;
      if (!nodeId) continue;
      const ctx = await mcp.callTool(mcp.toolNames.getContextualDescription, {
        nodeId,
      });
      await logger.log("plan", "mcp_tool_result", {
        tool: mcp.toolNames.getContextualDescription,
        nodeId,
        preview: ctx.text.slice(0, 500),
      });
      contextSnippets.push(ctx.text.slice(0, 2000));
    }
  }

  const plan = await generateAlignmentPlan({
    model: config.model,
    scan,
    categories,
    contextSnippets,
  });
  await logger.log("plan", "plan_generated", plan);

  const confirmed = await checkpointReviewPlan(plan);
  await logger.writePlan(confirmed);
  await logger.log("checkpoint_b", "checkpoint_answered", {
    selected: confirmed.selectedMergeGroupKeys,
    skipped: confirmed.skippedMergeGroupKeys,
  });

  await executePlan(config, mcp, logger, confirmed);
}

async function scanPhase(
  mcp: TopicSpaceMcpClient,
  logger: RunLogger,
): Promise<ScanResult> {
  const exact = await mcp.callTool(
    mcp.toolNames.findExactDuplicateNodeGroups,
    {},
  );
  await logger.log("scan", "mcp_tool_call", {
    tool: mcp.toolNames.findExactDuplicateNodeGroups,
  });
  await logger.log("scan", "mcp_tool_result", { preview: exact.parsed });

  const labels = await mcp.callTool(mcp.toolNames.getLabelDistribution, {});
  const edges = await mcp.callTool(mcp.toolNames.findDuplicateEdges, {});

  const exactParsed = exact.parsed as {
    totalNodeCount?: number;
  } | null;
  const edgesParsed = edges.parsed as { totalEdgeCount?: number } | null;

  const scan: ScanResult = {
    exactDuplicateGroups: exact.parsed ?? exact.text,
    labelDistribution: labels.parsed ?? labels.text,
    duplicateEdgeGroups: edges.parsed ?? edges.text,
    graphSummary: {
      totalNodeCount: exactParsed?.totalNodeCount ?? 0,
      totalEdgeCount: edgesParsed?.totalEdgeCount ?? 0,
    },
  };

  await logger.log("scan", "scan_completed", scan);
  return scan;
}

async function executePlan(
  config: AgentConfig,
  mcp: TopicSpaceMcpClient,
  logger: RunLogger,
  confirmed: ConfirmedPlan,
) {
  const draftResult = await mcp.callTool(mcp.toolNames.createDraftProposal, {
    title: `KG Alignment ${new Date().toISOString().slice(0, 10)}`,
    description:
      "KG Alignment CLI エージェントによる重複統合・表記正規化・エッジ整理の変更提案です。",
  });
  await logger.log("execute", "mcp_tool_call", {
    tool: mcp.toolNames.createDraftProposal,
  });

  if (draftResult.isError) {
    throw new Error(`ドラフト作成失敗: ${draftResult.text}`);
  }

  const proposalId = extractProposalId(draftResult.text);
  if (!proposalId) {
    throw new Error(`proposalId を取得できませんでした: ${draftResult.text}`);
  }

  for (const merge of confirmed.merges) {
    const args: Record<string, unknown> = {
      proposalId,
      canonicalNodeId: merge.canonicalNodeId,
      duplicateNodeIds: merge.duplicateNodeIds,
    };
    if (merge.canonicalName) args.canonicalName = merge.canonicalName;
    if (merge.canonicalLabel) args.canonicalLabel = merge.canonicalLabel;

    const result = await mcp.callTool(mcp.toolNames.mergeNodesInDraft, args);
    await logger.log("execute", "mcp_tool_result", {
      tool: mcp.toolNames.mergeNodesInDraft,
      groupKey: merge.groupKey,
      result: result.parsed ?? result.text,
    });
    if (result.isError) {
      throw new Error(`merge failed: ${result.text}`);
    }
  }

  for (const norm of confirmed.labelNormalizations) {
    const result = await mcp.callTool(mcp.toolNames.upsertNode, {
      proposalId,
      nodeId: norm.nodeId,
      name: norm.name,
      label: norm.label,
      properties: {},
    });
    if (result.isError) {
      console.warn(`label normalization skipped for ${norm.nodeId}:`, result.text);
    }
  }

  if (confirmed.edgeDedup.length > 0) {
    const edgeGroups = confirmed.edgeDedup.map((g) => ({
      keepEdgeId: g.keepEdgeId,
      removeEdgeIds: g.edgeIds.filter((id) => id !== g.keepEdgeId),
    }));
    const dedup = await mcp.callTool(mcp.toolNames.deduplicateEdgesInDraft, {
      proposalId,
      edgeGroups,
    });
    await logger.log("execute", "mcp_tool_result", {
      tool: mcp.toolNames.deduplicateEdgesInDraft,
      result: dedup.parsed ?? dedup.text,
    });
  } else {
    const autoDedup = await mcp.callTool(
      mcp.toolNames.deduplicateEdgesInDraft,
      { proposalId },
    );
    await logger.log("execute", "mcp_tool_result", {
      tool: mcp.toolNames.deduplicateEdgesInDraft,
      auto: true,
      result: autoDedup.parsed ?? autoDedup.text,
    });
  }

  const diff = await mcp.callTool(mcp.toolNames.getDraftDiff, { proposalId });
  const diffSummary = formatDiffSummary(diff.parsed ?? diff.text);
  await logger.log("checkpoint_c", "diff_reviewed", { proposalId, diffSummary });

  let submitted = false;
  if (config.submit) {
    const shouldSubmit = await checkpointSubmitDiff(diffSummary);
    if (shouldSubmit) {
      const submit = await mcp.callTool(mcp.toolNames.submitProposal, {
        proposalId,
      });
      if (submit.isError) {
        throw new Error(`提出失敗: ${submit.text}`);
      }
      submitted = true;
      await logger.log("submit", "proposal_submitted", {
        proposalId,
        result: submit.parsed ?? submit.text,
      });
    }
  }

  const summary = `# KG Alignment run summary

- runId: ${logger.runId}
- topicSpaceId: ${config.topicSpaceId}
- proposalId: ${proposalId}
- submitted: ${submitted}
- merges applied: ${confirmed.merges.length}
- label changes: ${confirmed.labelNormalizations.length}
- edge groups: ${confirmed.edgeDedup.length}

## Review

${diffSummary}

## Next steps

1. Open \`${config.baseUrl}/proposals/${proposalId}\` in the browser
2. Review and merge via the existing proposal UI
`;
  await logger.writeSummary(summary);
  await logger.log("finish", "run_finished", { proposalId, submitted });
  console.log(`\nDone. Logs: ${logger.runDir}`);
  console.log(`Proposal: ${config.baseUrl}/proposals/${proposalId}`);
}
