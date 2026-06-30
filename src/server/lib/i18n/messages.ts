import type { Locale } from "i18n/routing";

export type CommonTrpcMessageKey =
  | "unauthorized"
  | "notFound"
  | "forbidden"
  | "badRequest"
  | "internalServerError"
  | "notImplemented"
  | "workspace.notFoundOrDenied"
  | "workspace.publishedNotFound"
  | "workspace.notFound"
  | "workspace.edgeNotReferenced";

const JA: Record<CommonTrpcMessageKey, string> = {
  unauthorized: "認証が必要です",
  notFound: "リソースが見つかりません",
  forbidden: "この操作を行う権限がありません",
  badRequest: "リクエストが無効です",
  internalServerError: "サーバーエラーが発生しました",
  notImplemented: "この機能は未実装です",
  "workspace.notFoundOrDenied":
    "ワークスペースが見つからないか、アクセス権限がありません",
  "workspace.publishedNotFound": "公開されたワークスペースが見つかりません",
  "workspace.notFound": "ワークスペースが見つかりません",
  "workspace.edgeNotReferenced":
    "指定されたエッジはこのワークスペースで参照されていません",
};

const EN: Record<CommonTrpcMessageKey, string> = {
  unauthorized: "Authentication required",
  notFound: "Resource not found",
  forbidden: "You do not have permission to perform this action",
  badRequest: "Invalid request",
  internalServerError: "An internal server error occurred",
  notImplemented: "This feature is not implemented",
  "workspace.notFoundOrDenied":
    "Workspace not found or access denied",
  "workspace.publishedNotFound": "Published workspace not found",
  "workspace.notFound": "Workspace not found",
  "workspace.edgeNotReferenced":
    "The specified edge is not referenced in this workspace",
};

export function getTrpcMessage(
  locale: Locale,
  key: CommonTrpcMessageKey,
): string {
  return locale === "en" ? EN[key] : JA[key];
}

export function formatTrpcMessage(
  locale: Locale,
  template: string,
  params: Record<string, string>,
): string {
  return Object.entries(params).reduce(
    (msg, [key, value]) => msg.replaceAll(`{${key}}`, value),
    template,
  );
}
