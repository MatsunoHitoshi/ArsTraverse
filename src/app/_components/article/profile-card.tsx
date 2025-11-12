"use client";

import React from "react";
import Image from "next/image";
import { api } from "@/trpc/react";

interface ProfileCardProps {
  userId: string;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({ userId }) => {
  const { data: user, isLoading } = api.user.getByIdPublic.useQuery(
    { id: userId },
    {
      enabled: !!userId,
    },
  );

  if (isLoading) {
    return (
      <div className="flex w-full min-w-64 flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="h-12 w-12 animate-pulse rounded-full bg-slate-700"></div>
        <div className="h-4 w-32 animate-pulse rounded bg-slate-700"></div>
        <div className="h-3 w-24 animate-pulse rounded bg-slate-700"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex w-full min-w-64 flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800 p-4">
      <div className="flex flex-row items-center gap-3">
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name ?? "ユーザー"}
            width={24}
            height={24}
            className="rounded-full border border-slate-600"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-slate-400">
            {user.name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="flex flex-col">
          <div className="text-sm font-semibold text-slate-100">
            {user.name ?? "未設定"}
          </div>
        </div>
      </div>
    </div>
  );
};
