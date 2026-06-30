"use client";

import type { User } from "@prisma/client";
import Image from "next/image";
import { PersonIcon, PlusIcon, TrashIcon } from "../icons";
import { Modal } from "../modal/modal";
import { DeleteRecordModal } from "../modal/delete-record-modal";
import { Button } from "../button/button";
import { useState } from "react";
import { api } from "@/trpc/react";
import {
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import clsx from "clsx";
import { useTranslations } from "next-intl";

type MemberListModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  members?: User[] | null;
  isCurrentUserAdmin?: boolean;
  currentUserId?: string | null;
  topicSpaceId?: string;
  refetch?: () => void;
};

type SearchUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export const MemberListModal = ({
  isOpen,
  setIsOpen,
  members,
  isCurrentUserAdmin = false,
  currentUserId,
  topicSpaceId,
  refetch,
}: MemberListModalProps) => {
  const t = useTranslations("topicSpace");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [removeMemberModalOpen, setRemoveMemberModalOpen] = useState(false);
  const [memberToRemoveId, setMemberToRemoveId] = useState<string | null>(null);

  const { data: searchResults = [] } = api.user.searchByUserIdOrEmail.useQuery(
    { query: searchQuery.trim() },
    {
      enabled: searchQuery.trim().length >= 1,
    },
  );

  const addAdmin = api.topicSpaces.addAdmin.useMutation({
    onSuccess: () => {
      refetch?.();
      setSearchQuery("");
      setSelectedUser(null);
    },
    onError: (e) => {
      console.error(e);
      alert(e.message);
    },
  });


  const memberIds = new Set(members?.map((m) => m.id) ?? []);
  const filteredResults = searchResults.filter((u) => !memberIds.has(u.id));

  const handleAddUser = (user: SearchUser) => {
    if (!topicSpaceId) return;
    addAdmin.mutate({ topicSpaceId, userId: user.id });
  };

  const handleRemoveUserClick = (userId: string) => {
    setMemberToRemoveId(userId);
    setRemoveMemberModalOpen(true);
  };

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={t("members")} size="medium">
      <div className="flex flex-col gap-4">
        {/* メンバー一覧 */}
        <div className="flex flex-col gap-2">
          {members && members.length > 0 ? (
            members.map((member) => {
              const isCurrentUser = member.id === currentUserId;
              const canRemove =
                isCurrentUserAdmin &&
                !isCurrentUser &&
                topicSpaceId &&
                refetch;

              return (
                <div
                  key={member.id}
                  className="flex flex-row items-center justify-between gap-3 rounded-lg bg-slate-50/10 p-3"
                >
                  <div className="flex flex-row items-center gap-3 min-w-0">
                    {member.image ? (
                      <Image
                        src={member.image}
                        alt={member.name ?? t("memberAlt")}
                        width={40}
                        height={40}
                        className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-600">
                        <PersonIcon height={20} width={20} color="white" />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <div className="font-medium">
                        {member.name ?? t("nameNotSet")}
                      </div>
                      {member.email && (
                        <div className="truncate text-sm text-slate-400">
                          {member.email}
                        </div>
                      )}
                    </div>
                  </div>
                  {canRemove && (
                    <Button
                      onClick={() => handleRemoveUserClick(member.id)}
                      className="!h-8 !w-8 !min-w-8 !flex-shrink-0 !bg-transparent !p-2 hover:!bg-error-red/20"
                      aria-label={t("removeMemberAria", {
                        name: member.name ?? t("memberAlt"),
                      })}
                    >
                      <TrashIcon
                        height={16}
                        width={16}
                        color="#ea1c0c"
                      />
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-4 text-center text-slate-400">
              {t("noMembers")}
            </div>
          )}
        </div>

        {/* 管理者用: 招待セクション */}
        {isCurrentUserAdmin && topicSpaceId && refetch && (
          <div className="border-t border-slate-600 pt-4">
            <div className="mb-2 text-sm font-medium text-slate-300">
              {t("inviteMember")}
            </div>
            <div className="flex flex-col gap-2">
              <Combobox
                value={selectedUser}
                onChange={(user) => setSelectedUser(user)}
                nullable
              >
                <ComboboxInput
                  displayValue={(user: SearchUser | null) =>
                    user
                      ? [user.name ?? t("nameNotSet"), user.email]
                          .filter(Boolean)
                          .join(" / ") || user.id
                      : ""
                  }
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSelectedUser(null);
                  }}
                  placeholder={t("userSearchPlaceholder")}
                  className={clsx(
                    "w-full rounded-lg border-none bg-white/5 py-2 pl-3 pr-8 text-sm text-white",
                    "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
                  )}
                />
                <ComboboxOptions
                  anchor="bottom start"
                  className="z-50 max-h-48 max-w-full overflow-y-auto rounded-md border border-slate-600 bg-slate-900"
                >
                  {filteredResults.length > 0 ? (
                    filteredResults.map((user) => (
                      <ComboboxOption
                        key={user.id}
                        value={user}
                        className="flex cursor-pointer items-center gap-3 p-2 text-slate-50 data-[focus]:bg-slate-600"
                      >
                        {user.image ? (
                          <Image
                            src={user.image}
                            alt={user.name ?? t("memberAlt")}
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-600">
                            <PersonIcon height={16} width={16} color="white" />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {user.name ?? t("nameNotSet")}
                          </span>
                          {user.email && (
                            <span className="text-xs text-slate-400">
                              {user.email}
                            </span>
                          )}
                        </div>
                      </ComboboxOption>
                    ))
                  ) : (
                    <div className="p-3 text-center text-sm text-slate-400">
                      {searchQuery.trim()
                        ? t("noMatchingUsers")
                        : t("enterUserIdOrEmail")}
                    </div>
                  )}
                </ComboboxOptions>
              </Combobox>
              <Button
                onClick={() => selectedUser && handleAddUser(selectedUser)}
                disabled={!selectedUser || addAdmin.isPending}
                className="flex flex-row items-center gap-2"
              >
                <PlusIcon height={16} width={16} color="white" />
                <span>{t("add")}</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {memberToRemoveId && topicSpaceId && refetch && (
        <DeleteRecordModal
          isOpen={removeMemberModalOpen}
          setIsOpen={setRemoveMemberModalOpen}
          type="topicSpaceMember"
          id={memberToRemoveId}
          topicSpaceId={topicSpaceId}
          refetch={refetch}
        />
      )}
    </Modal>
  );
};
