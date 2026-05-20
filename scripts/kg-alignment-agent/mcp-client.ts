import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { resolveMcpToolIdentifier } from "@/app/_utils/mcp/mcp-tool-identifier";

export type McpToolResult = {
  text: string;
  isError: boolean;
  parsed?: unknown;
};

export class TopicSpaceMcpClient {
  private client: Client;
  readonly identifier: string;
  readonly toolNames: {
    findExactDuplicateNodeGroups: string;
    findDuplicateEdges: string;
    getLabelDistribution: string;
    findDuplicateNodeCandidates: string;
    getContextualDescription: string;
    createDraftProposal: string;
    mergeNodesInDraft: string;
    deduplicateEdgesInDraft: string;
    upsertNode: string;
    getDraftDiff: string;
    submitProposal: string;
  };

  constructor(
    private readonly topicSpaceId: string,
    private readonly baseUrl: string,
    private readonly sessionCookie: string,
    private readonly userAuthToken?: string,
    storedIdentifier?: string | null,
  ) {
    this.identifier = resolveMcpToolIdentifier(
      topicSpaceId,
      storedIdentifier,
    );
    const id = this.identifier;
    this.toolNames = {
      findExactDuplicateNodeGroups: `find_exact_duplicate_node_groups_in_${id}`,
      findDuplicateEdges: `find_duplicate_edges_in_${id}`,
      getLabelDistribution: `get_label_distribution_in_${id}`,
      findDuplicateNodeCandidates: `find_duplicate_node_candidates_in_${id}`,
      getContextualDescription: `get_contextual_description_from_${id}`,
      createDraftProposal: `create_graph_edit_proposal_draft_in_${id}`,
      mergeNodesInDraft: `merge_nodes_in_draft_in_${id}`,
      deduplicateEdgesInDraft: `deduplicate_edges_in_draft_in_${id}`,
      upsertNode: `upsert_node_in_${id}`,
      getDraftDiff: `get_graph_edit_proposal_diff_in_${id}`,
      submitProposal: `submit_graph_edit_proposal_in_${id}`,
    };

    const url = new URL(
      `${baseUrl.replace(/\/$/, "")}/api/topic-spaces/${topicSpaceId}/mcp`,
    );
    const headers: Record<string, string> = {};
    if (sessionCookie) {
      headers.Cookie = sessionCookie.includes("=")
        ? sessionCookie
        : `next-auth.session-token=${sessionCookie}`;
    }
    if (userAuthToken) {
      headers["User-Authorization"] = userAuthToken;
    }

    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers },
    });
    this.client = new Client({
      name: "kg-alignment-agent",
      version: "1.0.0",
    });
    this.transport = transport;
  }

  private transport: StreamableHTTPClientTransport;

  async connect() {
    await this.client.connect(this.transport);
  }

  async close() {
    await this.client.close();
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    const content = Array.isArray(result.content) ? result.content : [];
    const textBlock = content.find(
      (block: unknown): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        (block as { type: string }).type === "text" &&
        "text" in block &&
        typeof (block as { text: unknown }).text === "string",
    );

    const text = textBlock?.text ?? "";
    let parsed: unknown;
    let isError = Boolean(result.isError);
    try {
      parsed = JSON.parse(text) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "isError" in parsed &&
        (parsed as { isError?: boolean }).isError
      ) {
        isError = true;
      }
    } catch {
      parsed = undefined;
    }

    return { text, isError, parsed };
  }

}
