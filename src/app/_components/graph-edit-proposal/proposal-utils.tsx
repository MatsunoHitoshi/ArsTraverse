import { ProposalStatus } from "@prisma/client";
import { Badge } from "../badge/badge";
import {
  LockClosedIcon,
  CheckIcon,
  CrossLargeIcon,
  EyeOpenIcon,
} from "../icons";

export const getStatusBadge = (status: ProposalStatus) => {
  const statusConfig = {
    [ProposalStatus.DRAFT]: {
      label: "下書き",
      color: "bg-gray-600 text-gray-200",
    },
    [ProposalStatus.PENDING]: {
      label: "レビュー待ち",
      color: "bg-yellow-600 text-yellow-200",
    },
    [ProposalStatus.IN_REVIEW]: {
      label: "レビュー中",
      color: "bg-blue-600 text-blue-200",
    },
    [ProposalStatus.LOCKED]: {
      label: "ロック済み",
      color: "bg-purple-600 text-purple-200",
    },
    [ProposalStatus.APPROVED]: {
      label: "承認済み",
      color: "bg-green-600 text-green-200",
    },
    [ProposalStatus.REJECTED]: {
      label: "却下",
      color: "bg-red-600 text-red-200",
    },
    [ProposalStatus.MERGED]: {
      label: "マージ済み",
      color: "bg-emerald-600 text-emerald-200",
    },
    [ProposalStatus.CANCELLED]: {
      label: "取り下げ",
      color: "bg-gray-600 text-gray-300",
    },
  };

  const config = statusConfig[status];
  return <Badge className={config.color}>{config.label}</Badge>;
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
