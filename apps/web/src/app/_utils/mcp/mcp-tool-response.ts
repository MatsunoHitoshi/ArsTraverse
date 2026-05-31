import { TRPCError } from "@trpc/server";

export function mcpTextContent(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

export function mcpErrorContent(
  code: string,
  message: string,
  details?: unknown,
) {
  return mcpTextContent(
    JSON.stringify(
      {
        isError: true,
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
      null,
      2,
    ),
  );
}

export function formatMcpToolError(
  error: unknown,
  fallbackMessage: string,
): ReturnType<typeof mcpTextContent> {
  if (error instanceof TRPCError) {
    if (error.code === "UNAUTHORIZED") {
      return mcpErrorContent(
        "UNAUTHORIZED",
        "ログインセッションが必要です。CLI では ALIGNMENT_AGENT_SESSION_COOKIE を設定してください。",
        error.message,
      );
    }
    if (error.code === "FORBIDDEN") {
      return mcpErrorContent("FORBIDDEN", error.message, error.cause);
    }
    return mcpErrorContent(error.code, error.message, error.cause);
  }

  if (error instanceof Error) {
    return mcpErrorContent("INTERNAL_ERROR", error.message || fallbackMessage);
  }

  return mcpErrorContent("INTERNAL_ERROR", fallbackMessage);
}
