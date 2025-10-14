"use client";

import React, { useState } from "react";
import { api } from "@/trpc/react";
import {
  GraphChangeEntityType,
  GraphChangeType,
  ProposalStatus,
} from "@prisma/client";
import { Button } from "../button/button";
import { Badge } from "../badge/badge";
import { Textarea } from "../textarea";
import { formatRelativeTime } from "@/app/_utils/date/format-date";
import { DiffViewer } from "./diff-viewer";
import { CommentSection } from "./comment-section";
import {
  LockClosedIcon,
  EyeOpenIcon,
  CheckIcon,
  CrossLargeIcon,
  ArrowMergeIcon,
} from "../icons";
import Image from "next/image";

interface ProposalDetailProps {
  proposalId: string;
  onBack?: () => void;
}

export const ProposalDetail: React.FC<ProposalDetailProps> = ({
  proposalId,
  onBack,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const {
    data: proposal,
    isLoading,
    refetch,
  } = api.graphEditProposal.getProposalById.useQuery({
    proposalId,
  });

  const lockProposal = api.graphEditProposal.lockProposal.useMutation({
    onSuccess: () => {
      setIsSubmitting(false);
      void refetch();
    },
    onError: (error) => {
      console.error("ロックエラー:", error);
      setIsSubmitting(false);
    },
  });

  const unlockProposal = api.graphEditProposal.unlockProposal.useMutation({
    onSuccess: () => {
      setIsSubmitting(false);
      void refetch();
    },
    onError: (error) => {
      console.error("ロック解除エラー:", error);
      setIsSubmitting(false);
    },
  });

  const reviewProposal = api.graphEditProposal.reviewProposal.useMutation({
    onSuccess: () => {
      setIsSubmitting(false);
      void refetch();
    },
    onError: (error) => {
      console.error("レビュー開始エラー:", error);
      setIsSubmitting(false);
    },
  });

  const approveProposal = api.graphEditProposal.approveProposal.useMutation({
    onSuccess: () => {
      setIsSubmitting(false);
      void refetch();
    },
    onError: (error) => {
      console.error("承認エラー:", error);
      setIsSubmitting(false);
    },
  });

  const rejectProposal = api.graphEditProposal.rejectProposal.useMutation({
    onSuccess: () => {
      setIsSubmitting(false);
      setRejectionReason("");
      void refetch();
    },
    onError: (error) => {
      console.error("却下エラー:", error);
      setIsSubmitting(false);
    },
  });

  const mergeProposal = api.graphEditProposal.mergeProposal.useMutation({
    onSuccess: () => {
      setIsSubmitting(false);
      void refetch();
    },
    onError: (error) => {
      console.error("マージエラー:", error);
      setIsSubmitting(false);
    },
  });

  const cancelProposal = api.graphEditProposal.cancelProposal.useMutation({
    onSuccess: () => {
      setIsSubmitting(false);
      void refetch();
    },
    onError: (error) => {
      console.error("取り下げエラー:", error);
      setIsSubmitting(false);
    },
  });

  const getStatusBadge = (status: ProposalStatus) => {
    const statusConfig = {
      [ProposalStatus.DRAFT]: {
        label: "下書き",
        color: "bg-gray-100 text-gray-800",
      },
      [ProposalStatus.PENDING]: {
        label: "レビュー待ち",
        color: "bg-yellow-100 text-yellow-800",
      },
      [ProposalStatus.IN_REVIEW]: {
        label: "レビュー中",
        color: "bg-blue-100 text-blue-800",
      },
      [ProposalStatus.LOCKED]: {
        label: "ロック済み",
        color: "bg-purple-100 text-purple-800",
      },
      [ProposalStatus.APPROVED]: {
        label: "承認済み",
        color: "bg-green-100 text-green-800",
      },
      [ProposalStatus.REJECTED]: {
        label: "却下",
        color: "bg-red-100 text-red-800",
      },
      [ProposalStatus.MERGED]: {
        label: "マージ済み",
        color: "bg-emerald-100 text-emerald-800",
      },
      [ProposalStatus.CANCELLED]: {
        label: "取り下げ",
        color: "bg-gray-100 text-gray-600",
      },
    };

    const config = statusConfig[status];
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const handleAction = async (action: () => Promise<unknown>) => {
    setIsSubmitting(true);
    try {
      await action();
    } catch (error) {
      console.error("アクション実行エラー:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="py-8 text-center text-gray-500">
        変更提案が見つかりません
      </div>
    );
  }

  const isAdmin = proposal.topicSpace.admins.some(
    (admin) => admin.id === proposal.proposerId,
  );
  const isProposer = proposal.proposerId === proposal.proposerId;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button size="small" onClick={onBack}>
            ← 戻る
          </Button>
          <h1 className="text-2xl font-semibold">{proposal.title}</h1>
          {getStatusBadge(proposal.status)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* メインコンテンツ */}
        <div className="space-y-6 lg:col-span-2">
          {/* 提案情報 */}
          <div className="rounded-lg border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">提案内容</h2>

            {proposal.description && (
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-medium text-gray-700">説明</h3>
                <p className="whitespace-pre-wrap text-gray-600">
                  {proposal.description}
                </p>
              </div>
            )}

            <div className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-gray-700">
                変更内容
              </h3>
              <DiffViewer
                changes={
                  proposal.changes as unknown as {
                    changeType: GraphChangeType;
                    changeEntityType: GraphChangeEntityType;
                    changeEntityId: string;
                    previousState: {
                      nodes: unknown[];
                      relationships: unknown[];
                    };
                    nextState: { nodes: unknown[]; relationships: unknown[] };
                  }[]
                }
              />
            </div>
          </div>

          {/* コメントセクション */}
          <div className="rounded-lg border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">コメント</h2>
            <CommentSection proposalId={proposalId} />
          </div>
        </div>

        {/* サイドバー */}
        <div className="space-y-6">
          {/* 提案情報 */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold">提案情報</h3>

            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-700">提案者:</span>
                <div className="mt-1 flex items-center gap-2">
                  {proposal.proposer.image && (
                    <Image
                      src={proposal.proposer.image}
                      alt={proposal.proposer.name ?? ""}
                      className="h-6 w-6 rounded-full"
                      height={24}
                      width={24}
                    />
                  )}
                  <span>{proposal.proposer.name ?? "不明"}</span>
                </div>
              </div>

              {proposal.reviewer && (
                <div>
                  <span className="font-medium text-gray-700">
                    レビュー担当:
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    {proposal.reviewer.image && (
                      <Image
                        src={proposal.reviewer.image}
                        alt={proposal.reviewer.name ?? ""}
                        className="h-6 w-6 rounded-full"
                        height={24}
                        width={24}
                      />
                    )}
                    <span>{proposal.reviewer.name ?? "不明"}</span>
                  </div>
                </div>
              )}

              {proposal.lockedBy && (
                <div>
                  <span className="font-medium text-gray-700">ロック中:</span>
                  <div className="mt-1 flex items-center gap-2">
                    {proposal.lockedBy.image && (
                      <Image
                        src={proposal.lockedBy.image}
                        alt={proposal.lockedBy.name ?? ""}
                        className="h-6 w-6 rounded-full"
                        height={24}
                        width={24}
                      />
                    )}
                    <span className="text-purple-600">
                      {proposal.lockedBy.name ?? "不明"}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <span className="font-medium text-gray-700">作成日時:</span>
                <div className="mt-1">
                  {formatRelativeTime(new Date(proposal.createdAt))}
                </div>
              </div>

              {proposal.reviewedAt && (
                <div>
                  <span className="font-medium text-gray-700">
                    レビュー開始:
                  </span>
                  <div className="mt-1">
                    {formatRelativeTime(new Date(proposal.reviewedAt))}
                  </div>
                </div>
              )}

              {proposal.approvedAt && (
                <div>
                  <span className="font-medium text-gray-700">承認日時:</span>
                  <div className="mt-1">
                    {formatRelativeTime(new Date(proposal.approvedAt))}
                  </div>
                </div>
              )}

              {proposal.rejectedAt && (
                <div>
                  <span className="font-medium text-gray-700">却下日時:</span>
                  <div className="mt-1">
                    {formatRelativeTime(new Date(proposal.rejectedAt))}
                  </div>
                </div>
              )}

              {proposal.rejectionReason && (
                <div>
                  <span className="font-medium text-gray-700">却下理由:</span>
                  <p className="mt-1 text-red-600">
                    {proposal.rejectionReason}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* アクションボタン */}
          <div className="rounded-lg border bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold">アクション</h3>

            <div className="space-y-3">
              {/* ロック/ロック解除 */}
              {isAdmin && (
                <>
                  {proposal.status === ProposalStatus.PENDING &&
                    !proposal.lockedById && (
                      <Button
                        onClick={() =>
                          handleAction(() =>
                            lockProposal.mutateAsync({ proposalId }),
                          )
                        }
                        disabled={isSubmitting}
                        className="w-full"
                      >
                        <LockClosedIcon height={16} width={16} color="white" />
                        ロック
                      </Button>
                    )}

                  {proposal.status === ProposalStatus.LOCKED && (
                    <Button
                      onClick={() =>
                        handleAction(() =>
                          unlockProposal.mutateAsync({ proposalId }),
                        )
                      }
                      disabled={isSubmitting}
                      className="w-full"
                    >
                      <ArrowMergeIcon height={16} width={16} color="white" />
                      ロック解除
                    </Button>
                  )}
                </>
              )}

              {/* レビュー開始 */}
              {isAdmin && proposal.status === ProposalStatus.PENDING && (
                <Button
                  onClick={() =>
                    handleAction(() =>
                      reviewProposal.mutateAsync({ proposalId }),
                    )
                  }
                  disabled={isSubmitting}
                  className="w-full"
                >
                  <EyeOpenIcon height={16} width={16} color="white" />
                  レビュー開始
                </Button>
              )}

              {/* 承認 */}
              {isAdmin && proposal.status === ProposalStatus.IN_REVIEW && (
                <Button
                  onClick={() =>
                    handleAction(() =>
                      approveProposal.mutateAsync({ proposalId }),
                    )
                  }
                  disabled={isSubmitting}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <CheckIcon height={16} width={16} color="white" />
                  承認
                </Button>
              )}

              {/* 却下 */}
              {isAdmin && proposal.status === ProposalStatus.IN_REVIEW && (
                <div className="space-y-2">
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="却下理由を入力してください（任意）"
                    rows={2}
                  />
                  <Button
                    onClick={() =>
                      handleAction(() =>
                        rejectProposal.mutateAsync({
                          proposalId,
                          rejectionReason: rejectionReason || undefined,
                        }),
                      )
                    }
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    <CrossLargeIcon height={16} width={16} color="white" />
                    却下
                  </Button>
                </div>
              )}

              {/* マージ */}
              {isAdmin && proposal.status === ProposalStatus.APPROVED && (
                <Button
                  onClick={() =>
                    handleAction(() =>
                      mergeProposal.mutateAsync({ proposalId }),
                    )
                  }
                  disabled={isSubmitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  <ArrowMergeIcon height={16} width={16} color="white" />
                  マージ
                </Button>
              )}

              {/* 取り下げ */}
              {isProposer &&
                (
                  [
                    ProposalStatus.DRAFT,
                    ProposalStatus.PENDING,
                  ] as ProposalStatus[]
                ).includes(proposal.status) && (
                  <Button
                    onClick={() =>
                      handleAction(() =>
                        cancelProposal.mutateAsync({ proposalId }),
                      )
                    }
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    取り下げ
                  </Button>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
