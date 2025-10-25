"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { ProposalDetail } from "@/app/_components/graph-edit-proposal/proposal-detail";
import { Button } from "@/app/_components/button/button";
import { ChevronLeftIcon } from "@/app/_components/icons";

export default function ProposalPage() {
  const params = useParams();
  const proposalId = params.proposal_id as string;

  const { data: proposal, isLoading } =
    api.graphEditProposal.getProposalById.useQuery({
      proposalId,
    });

  const handleBack = () => {
    window.history.back();
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-lg text-gray-400">読み込み中...</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-lg text-gray-400">変更提案が見つかりません</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-900 pt-12 text-white">
      {/* メインコンテンツ */}
      <div className="flex h-[calc(100svh-3rem)] w-full flex-col p-4">
        {/* 固定ヘッダー */}
        <div className="mb-6 flex-shrink-0">
          <div className="flex w-full flex-row items-center gap-4">
            <Button
              onClick={handleBack}
              className="flex !h-8 !w-8 items-center justify-center"
            >
              <div className="h-4 w-4">
                <ChevronLeftIcon height={16} width={16} color="white" />
              </div>
            </Button>

            <div className="flex w-full flex-row items-center gap-2">
              <h2 className="text-lg font-semibold text-white">
                {proposal.title}
              </h2>
              <div className="mx-2 h-4 border-l border-gray-600"></div>
              <span className="text-sm text-gray-400">
                {proposal.proposer.name ?? "不明"} による提案
              </span>
            </div>
          </div>
        </div>

        {/* スクロール可能な提案詳細 */}
        <div className="flex-1 overflow-y-auto">
          <ProposalDetail proposalId={proposalId} onBack={handleBack} />
        </div>
      </div>
    </div>
  );
}
