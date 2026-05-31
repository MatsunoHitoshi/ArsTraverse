"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { ProposalStatus } from "@prisma/client";
import { Button } from "../button/button";
import { ListboxInput } from "../input/listbox-input";
import { ReloadIcon } from "../icons";
import { formatRelativeTime } from "@/app/_utils/date/format-date";
import Image from "next/image";
import { getStatusBadge, getStatusIcon } from "./proposal-utils";

interface ProposalListProps {
  topicSpaceId: string;
  onProposalSelect?: (proposalId: string) => void;
}

export const ProposalList: React.FC<ProposalListProps> = ({
  topicSpaceId,
  onProposalSelect,
}) => {
  const router = useRouter();
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
              className="transition-color cursor-pointer rounded-lg border p-4"
              onClick={() => onProposalSelect?.(proposal.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    {getStatusIcon(proposal.status)}
                    <h3 className="font-medium">{proposal.title}</h3>
                    {getStatusBadge(proposal.status)}
                  </div>

                  {proposal.description && (
                    <p className="mb-2 line-clamp-2 text-sm text-gray-600">
                      {proposal.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Image
                        src={proposal.proposer.image ?? ""}
                        alt={proposal.proposer.name ?? ""}
                        width={20}
                        height={20}
                        className="rounded-full"
                      />
                      <span>{proposal.proposer.name ?? "不明"}</span>
                    </div>

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
                    if (onProposalSelect) {
                      onProposalSelect(proposal.id);
                    } else {
                      router.push(`/proposals/${proposal.id}`);
                    }
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
