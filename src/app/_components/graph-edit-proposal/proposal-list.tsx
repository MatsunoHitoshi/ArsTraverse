"use client";

import React, { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "i18n/routing";
import { useRouter } from "i18n/navigation";
import { api } from "@/trpc/react";
import { ProposalStatus } from "@prisma/client";
import { Button } from "../button/button";
import { ListboxInput } from "../input/listbox-input";
import { ReloadIcon } from "../icons";
import { formatRelativeTime } from "@/app/_utils/date/format-date";
import Image from "next/image";
import { ProposalStatusBadge, getStatusIcon } from "./proposal-utils";

interface ProposalListProps {
  topicSpaceId: string;
  onProposalSelect?: (proposalId: string) => void;
}

export const ProposalList: React.FC<ProposalListProps> = ({
  topicSpaceId,
  onProposalSelect,
}) => {
  const t = useTranslations("proposal");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "ALL">(
    "ALL",
  );

  const statusOptions = useMemo(
    () => [
      { value: "ALL", label: t("status.all") },
      { value: ProposalStatus.DRAFT, label: t("status.DRAFT") },
      { value: ProposalStatus.PENDING, label: t("status.PENDING") },
      { value: ProposalStatus.IN_REVIEW, label: t("status.IN_REVIEW") },
      { value: ProposalStatus.LOCKED, label: t("status.LOCKED") },
      { value: ProposalStatus.APPROVED, label: t("status.APPROVED") },
      { value: ProposalStatus.REJECTED, label: t("status.REJECTED") },
      { value: ProposalStatus.MERGED, label: t("status.MERGED") },
      { value: ProposalStatus.CANCELLED, label: t("status.CANCELLED") },
    ],
    [t],
  );

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
        <div className="text-gray-500">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">{t("title")}</div>

        <div className="flex gap-2">
          <ListboxInput
            options={statusOptions}
            selected={statusFilter}
            setSelected={(value) =>
              setStatusFilter(value as ProposalStatus | "ALL")
            }
            placeholder={t("filterByStatus")}
          />

          <Button size="small" onClick={() => refetch()}>
            <ReloadIcon height={16} width={16} color="white" />
          </Button>
        </div>
      </div>

      {!proposals || proposals.length === 0 ? (
        <div className="py-8 text-center text-gray-500">{t("noProposals")}</div>
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
                    <ProposalStatusBadge status={proposal.status} />
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
                      <span>{proposal.proposer.name ?? t("unknown")}</span>
                    </div>

                    {proposal.lockedBy && (
                      <span className="text-purple-600">
                        {t("lockedBy", {
                          name: proposal.lockedBy.name ?? t("unknown"),
                        })}
                      </span>
                    )}
                    <span>
                      {formatRelativeTime(new Date(proposal.createdAt), locale)}
                    </span>
                    <span>
                      {t("commentCount", { count: proposal._count.comments })}
                    </span>
                    <span>
                      {t("changeCount", { count: proposal.changes.length })}
                    </span>
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
                  {t("viewDetail")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
