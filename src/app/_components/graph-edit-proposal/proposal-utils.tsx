"use client";

import { useTranslations } from "next-intl";
import { ProposalStatus } from "@prisma/client";
import { Badge } from "../badge/badge";
import {
  LockClosedIcon,
  CheckIcon,
  CrossLargeIcon,
  EyeOpenIcon,
} from "../icons";

const statusColors: Record<ProposalStatus, string> = {
  [ProposalStatus.DRAFT]: "bg-gray-600 text-gray-200",
  [ProposalStatus.PENDING]: "bg-yellow-600 text-yellow-200",
  [ProposalStatus.IN_REVIEW]: "bg-blue-600 text-blue-200",
  [ProposalStatus.LOCKED]: "bg-purple-600 text-purple-200",
  [ProposalStatus.APPROVED]: "bg-green-600 text-green-200",
  [ProposalStatus.REJECTED]: "bg-red-600 text-red-200",
  [ProposalStatus.MERGED]: "bg-emerald-600 text-emerald-200",
  [ProposalStatus.CANCELLED]: "bg-gray-600 text-gray-300",
};

export const ProposalStatusBadge: React.FC<{ status: ProposalStatus }> = ({
  status,
}) => {
  const t = useTranslations("proposal");

  return (
    <Badge className={statusColors[status]}>{t(`status.${status}`)}</Badge>
  );
};

export const getStatusIcon = (status: ProposalStatus) => {
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
