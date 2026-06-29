import type { Locale } from "i18n/routing";

export type GraphEditProposalMessageKey =
  | "notFound"
  | "submitForbidden"
  | "submitInvalidState"
  | "viewForbidden"
  | "repositoryNotFound"
  | "repositoryViewForbidden"
  | "lockForbidden"
  | "lockedByOther"
  | "unlockForbidden"
  | "reviewForbidden"
  | "reviewInvalidState"
  | "approveForbidden"
  | "approveInvalidState"
  | "rejectForbidden"
  | "rejectInvalidState"
  | "withdrawForbidden"
  | "withdrawInvalidState"
  | "commentForbidden"
  | "commentsViewForbidden"
  | "historyViewForbidden";

const JA: Record<GraphEditProposalMessageKey, string> = {
  notFound: "変更提案が見つかりません",
  submitForbidden: "この変更提案を提出する権限がありません",
  submitInvalidState: "この状態の変更提案は提出できません",
  viewForbidden: "この変更提案を閲覧する権限がありません",
  repositoryNotFound: "リポジトリが見つかりません",
  repositoryViewForbidden:
    "このリポジトリの変更提案を閲覧する権限がありません",
  lockForbidden: "この変更提案をロックする権限がありません",
  lockedByOther: "この変更提案は他のユーザーによってロックされています",
  unlockForbidden: "この変更提案のロックを解除する権限がありません",
  reviewForbidden: "この変更提案をレビューする権限がありません",
  reviewInvalidState: "この状態の変更提案はレビューできません",
  approveForbidden: "この変更提案を承認する権限がありません",
  approveInvalidState: "この状態の変更提案は承認できません",
  rejectForbidden: "この変更提案を却下する権限がありません",
  rejectInvalidState: "この状態の変更提案は却下できません",
  withdrawForbidden: "この変更提案を取り下げる権限がありません",
  withdrawInvalidState: "この状態の変更提案は取り下げできません",
  commentForbidden: "この変更提案にコメントする権限がありません",
  commentsViewForbidden:
    "この変更提案のコメントを閲覧する権限がありません",
  historyViewForbidden:
    "このリポジトリの変更履歴を閲覧する権限がありません",
};

const EN: Record<GraphEditProposalMessageKey, string> = {
  notFound: "Change proposal not found",
  submitForbidden: "You do not have permission to submit this change proposal",
  submitInvalidState:
    "This change proposal cannot be submitted in its current state",
  viewForbidden: "You do not have permission to view this change proposal",
  repositoryNotFound: "Repository not found",
  repositoryViewForbidden:
    "You do not have permission to view change proposals for this repository",
  lockForbidden: "You do not have permission to lock this change proposal",
  lockedByOther: "This change proposal is locked by another user",
  unlockForbidden:
    "You do not have permission to unlock this change proposal",
  reviewForbidden: "You do not have permission to review this change proposal",
  reviewInvalidState:
    "This change proposal cannot be reviewed in its current state",
  approveForbidden:
    "You do not have permission to approve this change proposal",
  approveInvalidState:
    "This change proposal cannot be approved in its current state",
  rejectForbidden: "You do not have permission to reject this change proposal",
  rejectInvalidState:
    "This change proposal cannot be rejected in its current state",
  withdrawForbidden:
    "You do not have permission to withdraw this change proposal",
  withdrawInvalidState:
    "This change proposal cannot be withdrawn in its current state",
  commentForbidden:
    "You do not have permission to comment on this change proposal",
  commentsViewForbidden:
    "You do not have permission to view comments on this change proposal",
  historyViewForbidden:
    "You do not have permission to view change history for this repository",
};

export function getGraphEditProposalMessage(
  locale: Locale,
  key: GraphEditProposalMessageKey,
): string {
  return locale === "en" ? EN[key] : JA[key];
}
