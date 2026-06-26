import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { NextRequest } from "next/server";
import {
  resolvePlatformMcpAuth,
  type McpAuthContext,
} from "@/server/mcp/resolve-mcp-auth";
import type { McpDraftHandlerCtx } from "@/server/mcp/graph-edit-draft-handlers";
import {
  mcpCreateSourceDocumentFromPlainText,
  mcpCreateTopicSpaceFromSourceDocuments,
  mcpGetSourceDocumentGraph,
  mcpGetTopicSpaceGraph,
  mcpAttachDocumentsToTopicSpace,
  mcpDetachDocumentFromTopicSpace,
  mcpGetTopicSpaceChangeHistory,
  mcpGetTopicSpaceChangeHistoryDetail,
  mcpReplayNodeMergesFromHistory,
  mcpGetTopicSpaceDriveSyncStatus,
  mcpSyncTopicSpaceDriveFolder,
} from "@/server/mcp/platform-handlers";
import { resolveLocaleFromHeaders } from "@/server/lib/locale";
import { getMcpMessage } from "@/server/lib/i18n/mcp-messages";
import type { Locale } from "i18n/routing";

const optionalIsoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Invalid ISO 8601 datetime",
  })
  .optional();

class AuthRequiredError extends Error {
  constructor() {
    super("MCP platform authentication required");
    this.name = "AuthRequiredError";
  }
}

function requirePlatformCtx(
  draftCtx: McpDraftHandlerCtx | null,
): McpDraftHandlerCtx {
  if (!draftCtx) {
    throw new AuthRequiredError();
  }
  return draftCtx;
}

type McpTextToolResult = {
  content: [{ type: "text"; text: string }];
};

function formatMcpToolError(
  error: unknown,
  fallbackMessage: string,
  locale: Locale,
): McpTextToolResult {
  if (error instanceof AuthRequiredError) {
    return {
      content: [{ type: "text", text: getMcpMessage(locale, "authRequired") }],
    };
  }
  console.error(error);
  const message =
    error instanceof Error && error.message ? error.message : fallbackMessage;
  return {
    content: [{ type: "text", text: message }],
  };
}

function createPlatformMcpHandler(
  auth: McpAuthContext,
  draftCtx: McpDraftHandlerCtx | null,
  locale: Locale,
) {
  return async (request: Request) => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = new McpServer({
      name: "arstraverse-platform-mcp",
      version: "1.0.0",
    });

    server.tool(
      "create_source_document_from_plain_text",
      `プレーンテキストを LLM で知識グラフに抽出し、SourceDocument（ドキュメント + DocumentGraph）を新規作成します。
      資料のテキストの取り込みに利用してください。認証が必要です。
作成後の sourceDocumentId を create_topic_space_from_source_documents に渡して TopicSpace を作成できます。`,
      {
        name: z
          .string()
          .min(1)
          .describe("SourceDocument の表示名（議事録2026-06-23）"),
        plainText: z.string().min(1).describe("抽出対象のプレーンテキスト全文"),
      },
      async ({ name, plainText }) => {
        try {
          const result = await mcpCreateSourceDocumentFromPlainText(
            requirePlatformCtx(draftCtx),
            { name, plainText },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "createSourceDocumentError"),
            locale,
          );
        }
      },
    );

    server.tool(
      "get_source_document_graph",
      `既存の SourceDocument に紐づく DocumentGraph（ノード・リレーション）をエクスポートします。
create_source_document_from_plain_text の再実行なしに、ローカル JSON スナップショットへ保存する用途などに使えます。`,
      {
        sourceDocumentId: z
          .string()
          .min(1)
          .describe("エクスポート対象の SourceDocument ID"),
        documentGraphId: z
          .string()
          .min(1)
          .optional()
          .describe("DocumentGraph ID（省略時は最新のグラフ）"),
      },
      async ({ sourceDocumentId, documentGraphId }) => {
        try {
          const result = await mcpGetSourceDocumentGraph(
            requirePlatformCtx(draftCtx),
            { sourceDocumentId, documentGraphId },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "getSourceDocumentGraphError"),
            locale,
          );
        }
      },
    );

    server.tool(
      "get_topic_space_graph",
      `TopicSpace に統合された知識グラフ（ノード・リレーション）をエクスポートします。
各ノード/エッジには sourceDocumentIds、provenance 配列で SourceDocument との対応が含まれます。
create_topic_space_from_source_documents の後、ローカル JSON へ保存する用途などに使えます。`,
      {
        topicSpaceId: z
          .string()
          .min(1)
          .describe("エクスポート対象の TopicSpace ID"),
      },
      async ({ topicSpaceId }) => {
        try {
          const result = await mcpGetTopicSpaceGraph(
            requirePlatformCtx(draftCtx),
            { topicSpaceId },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "getTopicSpaceGraphError"),
            locale,
          );
        }
      },
    );

    server.tool(
      "get_topic_space_drive_sync_status",
      `TopicSpace に設定された Google Drive 同期の状態を返します。
Drive フォルダ ID、最終同期日時、エラー有無を確認する用途に使えます。`,
      {
        topicSpaceId: z.string().min(1).describe("対象 TopicSpace ID"),
      },
      async ({ topicSpaceId }) => {
        try {
          const result = await mcpGetTopicSpaceDriveSyncStatus(
            requirePlatformCtx(draftCtx),
            { topicSpaceId },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "getDriveSyncStatusError"),
            locale,
          );
        }
      },
    );

    server.tool(
      "sync_topic_space_drive_folder",
      `TopicSpace に紐づく Google Drive フォルダを同期し、新規・更新ファイルを SourceDocument（INPUT_DRIVE）として取り込み、KG 抽出後に TopicSpace へ統合します。
設定者の Google Drive 連携（user OAuth）と TopicSpace のフォルダ設定が必要です。`,
      {
        topicSpaceId: z.string().min(1).describe("同期対象 TopicSpace ID"),
      },
      async ({ topicSpaceId }) => {
        try {
          const result = await mcpSyncTopicSpaceDriveFolder(
            requirePlatformCtx(draftCtx),
            { topicSpaceId },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "syncDriveFolderError"),
            locale,
          );
        }
      },
    );

    server.tool(
      "create_topic_space_from_source_documents",
      `複数の SourceDocument ID から TopicSpace（知識グラフリポジトリ）を新規作成します。
最初のドキュメントで TopicSpace を起こし、残りはグラフ統合（attach）でマージします。認証が必要です。
各 SourceDocument は呼び出しユーザーが所有し、DocumentGraph が存在している必要があります。`,
      {
        name: z.string().min(1).describe("作成する TopicSpace の名前"),
        sourceDocumentIds: z
          .array(z.string().min(1))
          .min(1)
          .describe("統合する SourceDocument ID の配列（1件以上）"),
        description: z
          .string()
          .optional()
          .describe("TopicSpace の説明（任意）"),
      },
      async ({ name, sourceDocumentIds, description }) => {
        try {
          const result = await mcpCreateTopicSpaceFromSourceDocuments(
            requirePlatformCtx(draftCtx),
            { name, sourceDocumentIds, description },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "createTopicSpaceError"),
            locale,
          );
        }
      },
    );

    server.tool(
      "attach_documents_to_topic_space",
      `既存 TopicSpace に SourceDocument を追加し、グラフを統合します。
認証ユーザーが TopicSpace 管理者である必要があります。node / edge provenance が記録されます。`,
      {
        topicSpaceId: z.string().min(1).describe("対象 TopicSpace ID"),
        documentIds: z
          .array(z.string().min(1))
          .min(1)
          .describe("追加する SourceDocument ID の配列"),
      },
      async ({ topicSpaceId, documentIds }) => {
        try {
          const result = await mcpAttachDocumentsToTopicSpace(
            requirePlatformCtx(draftCtx),
            { topicSpaceId, documentIds },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "attachDocumentsError"),
            locale,
          );
        }
      },
    );

    server.tool(
      "detach_document_from_topic_space",
      `TopicSpace から SourceDocument を 1 件切り離し、当該ドキュメント由来のノード・エッジを除去します。
他ドキュメントと共有されている統合ノードは残し、当該ドキュメントの provenance のみ削除します。
認証ユーザーが TopicSpace 管理者である必要があります。`,
      {
        topicSpaceId: z.string().min(1).describe("対象 TopicSpace ID"),
        documentId: z.string().min(1).describe("切り離す SourceDocument ID"),
      },
      async ({ topicSpaceId, documentId }) => {
        try {
          const result = await mcpDetachDocumentFromTopicSpace(
            requirePlatformCtx(draftCtx),
            { topicSpaceId, documentId },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "detachDocumentError"),
            locale,
          );
        }
      },
    );

    server.tool(
      "get_topic_space_change_history",
      `TopicSpace のグラフ変更履歴を取得します。
description が「ノードを統合しました」の行は UI からの手動ノード統合です。
mergeOnly=true で統合履歴のみに絞れます。before に ISO 日時を指定すると Detach/Attach より前の履歴だけ取得できます。`,
      {
        topicSpaceId: z.string().min(1).describe("対象 TopicSpace ID"),
        includeDetails: z
          .boolean()
          .optional()
          .describe("true のとき nodeLinkChangeHistories と parsedMerge を含める"),
        mergeOnly: z
          .boolean()
          .optional()
          .describe("true のとき手動ノード統合履歴のみ"),
        before: optionalIsoDateTime.describe(
          "この日時より前の履歴のみ（ISO 8601）",
        ),
        after: optionalIsoDateTime.describe(
          "この日時より後の履歴のみ（ISO 8601）",
        ),
        limit: z.number().int().min(1).max(500).optional(),
      },
      async ({
        topicSpaceId,
        includeDetails,
        mergeOnly,
        before,
        after,
        limit,
      }) => {
        try {
          const result = await mcpGetTopicSpaceChangeHistory(
            requirePlatformCtx(draftCtx),
            {
              topicSpaceId,
              includeDetails,
              mergeOnly,
              before,
              after,
              limit,
            },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "getChangeHistoryError"),
            locale,
          );
        }
      },
    );

    server.tool(
      "get_topic_space_change_history_detail",
      `変更履歴 1 件の詳細（nodeLinkChangeHistories / parsedMerge）を取得します。`,
      {
        changeHistoryId: z.string().min(1).describe("GraphChangeHistory ID"),
      },
      async ({ changeHistoryId }) => {
        try {
          const result = await mcpGetTopicSpaceChangeHistoryDetail(
            requirePlatformCtx(draftCtx),
            { changeHistoryId },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "getChangeHistoryDetailError"),
            locale,
          );
        }
      },
    );

    server.tool(
      "replay_node_merges_from_history",
      `TopicSpace の手動ノード統合履歴（「ノードを統合しました」）を解析し、現在のグラフ上で同じ統合を再適用します。
名前+ラベルで現在のノードを照合するため、Detach/Attach 後でも復元可能です。
dryRun=true で適用せずに確認できます。before でバックフィル開始日時より前の統合だけ対象にできます。`,
      {
        topicSpaceId: z.string().min(1).describe("対象 TopicSpace ID"),
        dryRun: z
          .boolean()
          .optional()
          .describe("true のとき統合を実行せず可能性のみ確認"),
        before: optionalIsoDateTime.describe(
          "この日時より前の統合履歴のみ再適用（ISO 8601）",
        ),
        after: optionalIsoDateTime.describe(
          "この日時より後の統合履歴のみ再適用（ISO 8601）",
        ),
        changeHistoryIds: z
          .array(z.string().min(1))
          .optional()
          .describe("特定の変更履歴 ID のみ再適用"),
      },
      async ({
        topicSpaceId,
        dryRun,
        before,
        after,
        changeHistoryIds,
      }) => {
        try {
          const result = await mcpReplayNodeMergesFromHistory(
            requirePlatformCtx(draftCtx),
            {
              topicSpaceId,
              dryRun,
              before,
              after,
              changeHistoryIds,
            },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return formatMcpToolError(
            error,
            getMcpMessage(locale, "replayNodeMergesError"),
            locale,
          );
        }
      },
    );

    await server.connect(transport);
    return transport.handleRequest(request);
  };
}

const routeHandler = async (request: NextRequest) => {
  const locale = resolveLocaleFromHeaders(request.headers);
  const mcpAuth = await resolvePlatformMcpAuth(request);
  if (!mcpAuth.ok) {
    return new Response(mcpAuth.message, { status: mcpAuth.status });
  }

  const handler = createPlatformMcpHandler(mcpAuth.auth, mcpAuth.draftCtx, locale);
  return handler(request);
};

export { routeHandler as GET, routeHandler as POST, routeHandler as DELETE };
