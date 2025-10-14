"use client";

import React, { useState } from "react";
import { api } from "@/trpc/react";
import { ProposalStatus } from "@prisma/client";
import { Button } from "../button/button";
import { Badge } from "../badge/badge";
import { ListboxInput } from "../input/listbox-input";
import {
  LockClosedIcon,
  CheckIcon,
  CrossLargeIcon,
  EyeOpenIcon,
  ReloadIcon,
} from "../icons";
import { formatRelativeTime } from "@/app/_utils/date/format-date";

interface ProposalListProps {
  topicSpaceId: string;
  onProposalSelect?: (proposalId: string) => void;
}

export const ProposalList: React.FC<ProposalListProps> = ({
  topicSpaceId,
  onProposalSelect,
}) => {
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "ALL">(
    "ALL",
  );

  // ListboxInput用のオプション配列
  const statusOptions = [
    { value: "ALL", label: "すべて" },
    { value: ProposalStatus.DRAFT, label: "下書き" },
    { value: ProposalStatus.PENDING, label: "レビュー待ち" },
    { value: ProposalStatus.IN_REVIEW, label: "レビュー中" },
    { value: ProposalStatus.LOCKED, label: "ロック済み" },
    { value: ProposalStatus.APPROVED, label: "承認済み" },
    { value: ProposalStatus.REJECTED, label: "却下" },
    { value: ProposalStatus.MERGED, label: "マージ済み" },
    { value: ProposalStatus.CANCELLED, label: "取り下げ" },
  ];

  const {
    data: proposals,
    isLoading,
    refetch,
  } = api.graphEditProposal.listProposalsByTopicSpace.useQuery({
    topicSpaceId,
    status: statusFilter === "ALL" ? undefined : statusFilter,
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

  const getStatusIcon = (status: ProposalStatus) => {
    switch (status) {
      case ProposalStatus.LOCKED:
        return <LockClosedIcon height={16} width={16} color="white" />;
      case ProposalStatus.APPROVED:
        return <CheckIcon height={16} width={16} color="white" />;
      case ProposalStatus.REJECTED:
        return <CrossLargeIcon height={16} width={16} color="white" />;
      default:
        return <EyeOpenIcon height={16} width={16} color="white" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">変更提案</div>

        <div className="flex gap-2">
          <ListboxInput
            options={statusOptions}
            selected={statusFilter}
            setSelected={(value) =>
              setStatusFilter(value as ProposalStatus | "ALL")
            }
            placeholder="ステータスで絞り込み"
          />

          <Button size="small" onClick={() => refetch()}>
            <ReloadIcon height={16} width={16} color="white" />
          </Button>
        </div>
      </div>

      {!proposals || proposals.length === 0 ? (
        <div className="py-8 text-center text-gray-500">
          変更提案がありません
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal) => (
            <div
              key={proposal.id}
              className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-gray-50"
              onClick={() => onProposalSelect?.(proposal.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    {getStatusIcon(proposal.status)}
                    <h3 className="font-medium text-gray-900">
                      {proposal.title}
                    </h3>
                    {getStatusBadge(proposal.status)}
                  </div>

                  {proposal.description && (
                    <p className="mb-2 line-clamp-2 text-sm text-gray-600">
                      {proposal.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>提案者: {proposal.proposer.name ?? "不明"}</span>
                    {proposal.reviewer && (
                      <span>
                        レビュー担当: {proposal.reviewer.name ?? "不明"}
                      </span>
                    )}
                    {proposal.lockedBy && (
                      <span className="text-purple-600">
                        ロック中: {proposal.lockedBy.name ?? "不明"}
                      </span>
                    )}
                    <span>
                      {formatRelativeTime(new Date(proposal.createdAt))}
                    </span>
                    <span>{proposal._count.comments}件のコメント</span>
                    <span>{proposal.changes.length}件の変更</span>
                  </div>
                </div>

                <Button
                  size="small"
                  onClick={() => {
                    onProposalSelect?.(proposal.id);
                  }}
                >
                  詳細
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
