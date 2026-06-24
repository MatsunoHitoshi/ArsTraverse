import { z } from "zod";

export const AlignmentPlanSchema = z.object({
  merges: z.array(
    z.object({
      groupKey: z.string(),
      canonicalNodeId: z.string(),
      duplicateNodeIds: z.array(z.string()),
      canonicalName: z.string().nullable(),
      canonicalLabel: z.string().nullable(),
      rationale: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
  labelNormalizations: z.array(
    z.object({
      nodeId: z.string(),
      name: z.string(),
      label: z.string(),
      rationale: z.string(),
    }),
  ),
  edgeDedup: z.array(
    z.object({
      edgeIds: z.array(z.string()).min(2),
      keepEdgeId: z.string(),
      rationale: z.string().nullable(),
    }),
  ),
});

export type AlignmentPlan = z.infer<typeof AlignmentPlanSchema>;

export type NormalizationCategory =
  | "exact_duplicates"
  | "fuzzy_duplicates"
  | "label_normalization"
  | "edge_dedup";

export type ScanResult = {
  exactDuplicateGroups: unknown;
  labelDistribution: unknown;
  duplicateEdgeGroups: unknown;
  graphSummary: {
    totalNodeCount: number;
    totalEdgeCount: number;
  };
};

export type ConfirmedPlan = AlignmentPlan & {
  selectedMergeGroupKeys: string[];
  skippedMergeGroupKeys: string[];
};

export type RunEventType =
  | "run_started"
  | "scan_completed"
  | "checkpoint_answered"
  | "plan_generated"
  | "mcp_tool_call"
  | "mcp_tool_result"
  | "diff_reviewed"
  | "proposal_submitted"
  | "run_finished"
  | "error";

export type RunEvent = {
  timestamp: string;
  phase: string;
  type: RunEventType;
  payload: unknown;
};

export type AgentConfig = {
  topicSpaceId: string;
  baseUrl: string;
  sessionCookie: string;
  userAuthToken?: string;
  accessToken?: string;
  model: string;
  dryRun: boolean;
  withContext: boolean;
  resumeRunId?: string;
  submit: boolean;
};
