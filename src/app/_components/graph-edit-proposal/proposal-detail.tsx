"use client";

import React, { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "i18n/routing";
import { api } from "@/trpc/react";
import { useSession } from "next-auth/react";
import {
  GraphChangeEntityType,
  GraphChangeType,
  ProposalStatus,
} from "@prisma/client";
import { Button } from "../button/button";
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
import { ProposalStatusBadge } from "./proposal-utils";
import { Link } from "i18n/navigation";
import {
  GraphEditChangeForFrontend,
  NodeTypeForFrontend,
  RelationshipTypeForFrontend,
} from "@/app/const/types";

interface ProposalDetailProps {
  proposalId: string;
  onBack?: () => void;
}

export const ProposalDetail: React.FC<ProposalDetailProps> = ({
  proposalId,
  onBack,
}) => {
  const t = useTranslations("proposal");
  const locale = useLocale() as Locale;
  const { data: session } = useSession();
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
        <div className="text-gray-500">{t("loading")}</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="py-8 text-center text-gray-500">{t("notFound")}</div>
    );
  }

  const isAdmin = proposal.topicSpace.admins.some(
    (admin) => admin.id === session?.user?.id,
  );
  const isProposer = proposal.proposerId === session?.user?.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-lg border border-gray-700 bg-slate-800 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {t("detail.proposalContent")}
              </h2>
              <ProposalStatusBadge status={proposal.status} />
            </div>

            {proposal.description && (
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-medium text-gray-300">
                  {t("detail.description")}
                </h3>
                <p className="whitespace-pre-wrap text-gray-400">
                  {proposal.description}
                </p>
              </div>
            )}

            <div className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-gray-300">
                {t("detail.changes")}
              </h3>
              <DiffViewer
                changes={proposal.changes as GraphEditChangeForFrontend[]}
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-slate-800 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">
              {t("detail.comments")}
            </h2>
            <CommentSection proposalId={proposalId} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-gray-700 bg-slate-800 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              {t("detail.repository")}
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex w-full items-center gap-1">
                <div className="truncate text-lg text-gray-200">
                  {proposal.topicSpace.name}
                </div>
              </div>

              {proposal.topicSpace.description && (
                <div>
                  <div className="mt-1 text-gray-400">
                    {proposal.topicSpace.description}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <Link
                  href={`/topic-spaces/${proposal.topicSpace.id}/graph`}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600"
                >
                  {t("detail.viewGraph")}
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-slate-800 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              {t("detail.info")}
            </h3>

            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-300">
                  {t("detail.proposer")}
                </span>
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
                  <span className="text-gray-400">
                    {proposal.proposer.name ?? t("unknown")}
                  </span>
                </div>
              </div>

              {proposal.reviewer && (
                <div>
                  <span className="font-medium text-gray-300">
                    {t("detail.reviewer")}
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
                    <span className="text-gray-400">
                      {proposal.reviewer.name ?? t("unknown")}
                    </span>
                  </div>
                </div>
              )}

              {proposal.lockedBy && (
                <div>
                  <span className="font-medium text-gray-300">
                    {t("detail.locked")}
                  </span>
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
                    <span className="text-purple-400">
                      {proposal.lockedBy.name ?? t("unknown")}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <span className="font-medium text-gray-300">
                  {t("detail.createdAt")}
                </span>
                <div className="mt-1 text-gray-400">
                  {formatRelativeTime(new Date(proposal.createdAt), locale)}
                </div>
              </div>

              {proposal.reviewedAt && (
                <div>
                  <span className="font-medium text-gray-300">
                    {t("detail.reviewStartedAt")}
                  </span>
                  <div className="mt-1 text-gray-400">
                    {formatRelativeTime(new Date(proposal.reviewedAt), locale)}
                  </div>
                </div>
              )}

              {proposal.approvedAt && (
                <div>
                  <span className="font-medium text-gray-300">
                    {t("detail.approvedAt")}
                  </span>
                  <div className="mt-1 text-gray-400">
                    {formatRelativeTime(new Date(proposal.approvedAt), locale)}
                  </div>
                </div>
              )}

              {proposal.rejectedAt && (
                <div>
                  <span className="font-medium text-gray-300">
                    {t("detail.rejectedAt")}
                  </span>
                  <div className="mt-1 text-gray-400">
                    {formatRelativeTime(new Date(proposal.rejectedAt), locale)}
                  </div>
                </div>
              )}

              {proposal.rejectionReason && (
                <div>
                  <span className="font-medium text-gray-300">
                    {t("detail.rejectionReason")}
                  </span>
                  <p className="mt-1 text-red-400">
                    {proposal.rejectionReason}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-slate-800 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              {t("detail.actions")}
            </h3>

            <div className="space-y-3">
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
                        className="flex flex-row items-center justify-center gap-1 hover:bg-slate-600"
                      >
                        <LockClosedIcon height={16} width={16} color="white" />
                        {t("detail.lock")}
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
                      className="lex flex-row items-center justify-center gap-1 hover:bg-slate-600"
                    >
                      <ArrowMergeIcon height={16} width={16} color="white" />
                      {t("detail.unlock")}
                    </Button>
                  )}
                </>
              )}

              {isAdmin && proposal.status === ProposalStatus.PENDING && (
                <Button
                  onClick={() =>
                    handleAction(() =>
                      reviewProposal.mutateAsync({ proposalId }),
                    )
                  }
                  disabled={isSubmitting}
                  className="flex flex-row items-center justify-center gap-1 hover:bg-slate-600"
                >
                  <EyeOpenIcon height={16} width={16} color="white" />
                  {t("detail.startReview")}
                </Button>
              )}

              {isAdmin && proposal.status === ProposalStatus.IN_REVIEW && (
                <Button
                  onClick={() =>
                    handleAction(() =>
                      approveProposal.mutateAsync({ proposalId }),
                    )
                  }
                  disabled={isSubmitting}
                  className="flex flex-row items-center justify-center gap-1 hover:bg-slate-600"
                >
                  <CheckIcon height={16} width={16} color="green" />
                  {t("detail.approve")}
                </Button>
              )}

              {isAdmin && proposal.status === ProposalStatus.IN_REVIEW && (
                <div className="space-y-2">
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder={t("detail.rejectionReasonPlaceholder")}
                    rows={2}
                    className="block w-full rounded-lg border border-gray-700 bg-slate-700 px-3 py-2 text-sm/6 text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  <div className="flex w-full justify-end">
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
                      className="flex flex-row items-center justify-center gap-1 hover:bg-slate-600"
                    >
                      <CrossLargeIcon height={16} width={16} color="red" />
                      {t("detail.reject")}
                    </Button>
                  </div>
                </div>
              )}

              {isAdmin && proposal.status === ProposalStatus.APPROVED && (
                <Button
                  onClick={() =>
                    handleAction(() =>
                      mergeProposal.mutateAsync({ proposalId }),
                    )
                  }
                  disabled={isSubmitting}
                  className="flex flex-row items-center justify-center gap-1 hover:bg-slate-600"
                >
                  <ArrowMergeIcon height={16} width={16} color="green" />
                  {t("detail.merge")}
                </Button>
              )}

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
                    {t("detail.cancel")}
                  </Button>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
