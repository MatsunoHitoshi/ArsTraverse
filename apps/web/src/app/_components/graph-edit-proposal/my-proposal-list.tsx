"use client";

import React from "react";
import { api } from "@/trpc/react";
import { ProposalStatus } from "@prisma/client";
import { Button } from "../button/button";
import { formatRelativeTime } from "@/app/_utils/date/format-date";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getStatusBadge, getStatusIcon } from "./proposal-utils";

interface MyProposalListProps {
  limit?: number;
}

export const MyProposalList: React.FC<MyProposalListProps> = ({
  limit = 5,
}) => {
  const router = useRouter();

  const { data: proposals, isLoading } =
    api.graphEditProposal.listMyProposals.useQuery({
      limit,
    });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!proposals || proposals.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">変更提案がありません</div>
    );
  }

  return (
    <div className="space-y-3">
      {proposals.map((proposal) => (
        <div
          key={proposal.id}
          className="transition-color cursor-pointer rounded-lg border p-4 hover:bg-slate-50/5"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/proposals/${proposal.id}`);
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-2 flex items-center gap-2">
                {getStatusIcon(proposal.status)}
                <h3 className="font-medium text-white">{proposal.title}</h3>
                {getStatusBadge(proposal.status)}
              </div>

              {proposal.description && (
                <p className="mb-2 line-clamp-2 text-sm text-gray-400">
                  {proposal.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <div className="flex w-1/3 items-center gap-1">
                  <span className="truncate text-gray-400">
                    {proposal.topicSpace.name}
                  </span>
                </div>

                {proposal.lockedBy && (
                  <span className="text-purple-400">
                    ロック中: {proposal.lockedBy.name ?? "不明"}
                  </span>
                )}
                <span>{formatRelativeTime(new Date(proposal.createdAt))}</span>
                <span>{proposal._count.comments}件のコメント</span>
                <span>{proposal.changes.length}件の変更</span>
              </div>
            </div>

            <Button
              size="small"
              onClick={() => {
                router.push(`/proposals/${proposal.id}`);
              }}
            >
              詳細
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};
