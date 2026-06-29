import type { Locale } from "i18n/routing";

export type AnnotationMessageKey =
  | "notFound"
  | "notFoundOrTargetNode"
  | "targetNodeNotFound"
  | "targetEdgeNotFound"
  | "parentNotFound"
  | "updateForbidden"
  | "deleteForbidden"
  | "hasChildren"
  | "graphExtractionError"
  | "invalidParams"
  | "repositoryNotFound"
  | "nodeNotInRepository"
  | "relationshipNotInRepository"
  | "clusteringFailed"
  | "cacheNotImplemented";

const JA: Record<AnnotationMessageKey, string> = {
  notFound: "注釈が見つかりません",
  notFoundOrTargetNode: "注釈または対象ノードが見つかりません",
  targetNodeNotFound: "対象のノードが見つかりません",
  targetEdgeNotFound: "対象のエッジが見つかりません",
  parentNotFound: "親注釈が見つかりません",
  updateForbidden: "この注釈を更新する権限がありません",
  deleteForbidden: "この注釈を削除する権限がありません",
  hasChildren:
    "子注釈が存在するため削除できません。先に子注釈を削除してください。",
  graphExtractionError: "グラフ抽出エラー: {error}",
  invalidParams: "パラメータが無効です: {errors}",
  repositoryNotFound: "リポジトリが見つかりません",
  nodeNotInRepository: "指定されたノードはこのリポジトリに属していません",
  relationshipNotInRepository:
    "指定されたリレーションシップはこのリポジトリに属していません",
  clusteringFailed: "クラスタリングに失敗しました: {error}",
  cacheNotImplemented: "キャッシュ機能は未実装です",
};

const EN: Record<AnnotationMessageKey, string> = {
  notFound: "Annotation not found",
  notFoundOrTargetNode: "Annotation or target node not found",
  targetNodeNotFound: "Target node not found",
  targetEdgeNotFound: "Target edge not found",
  parentNotFound: "Parent annotation not found",
  updateForbidden: "You do not have permission to update this annotation",
  deleteForbidden: "You do not have permission to delete this annotation",
  hasChildren:
    "Cannot delete because child annotations exist. Delete child annotations first.",
  graphExtractionError: "Graph extraction error: {error}",
  invalidParams: "Invalid parameters: {errors}",
  repositoryNotFound: "Repository not found",
  nodeNotInRepository:
    "The specified node does not belong to this repository",
  relationshipNotInRepository:
    "The specified relationship does not belong to this repository",
  clusteringFailed: "Clustering failed: {error}",
  cacheNotImplemented: "Cache feature is not implemented",
};

export function getAnnotationMessage(
  locale: Locale,
  key: AnnotationMessageKey,
  params?: Record<string, string>,
): string {
  const template = locale === "en" ? EN[key] : JA[key];
  if (!params) return template;
  return Object.entries(params).reduce(
    (msg, [k, v]) => msg.replaceAll(`{${k}}`, v),
    template,
  );
}
