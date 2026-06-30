"use client";

import React, { useState } from "react";
import {
  DashboardIcon,
  FileTextIcon,
  GearIcon,
  Pencil2Icon,
  PlusIcon,
  StackIcon,
} from "../icons";
import { Button } from "../button/button";
import { usePathname, useRouter } from "i18n/navigation";
import { TopicSpaceCreateModal } from "../topic-space/topic-space-create-modal";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { Link } from "i18n/navigation";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";

const Tab = ({
  label,
  icon,
  path,
  isActive,
}: {
  label: string;
  icon: React.ReactNode;
  path: string;
  isActive: boolean;
}) => {
  return (
    <div
      className={`border-b-2 border-transparent ${isActive && "!border-slate-50 font-semibold"}`}
    >
      <Link href={path}>
        <Button
          className={`flex cursor-pointer flex-row items-center gap-1 bg-transparent py-2 hover:bg-slate-50/10`}
        >
          <div className="h-4 w-4">{icon}</div>
          <div>{label}</div>
        </Button>
      </Link>
    </div>
  );
};

export const Tabs = ({ session }: { session: Session | null }) => {
  const t = useTranslations("tab");
  const pathname = usePathname();

  if (!session) {
    return null;
  }

  return (
    <div className="flex h-[46px] flex-row items-end gap-4">
      <Link href="/dashboard">
        <Button
          className={`flex flex-row items-center gap-1 rounded-none border-b-2 border-transparent bg-transparent !px-4 py-2 text-sm font-semibold ${pathname === "/dashboard" && "!border-slate-50"}`}
        >
          <div className="h-4 w-4">
            <DashboardIcon width={14} height={14} color="white" />
          </div>
          {t("dashboard")}
        </Button>
      </Link>

      <div className="flex flex-row items-end text-sm">
        <Tab
          label={t("workspaces")}
          icon={<Pencil2Icon width={16} height={16} color="white" />}
          path="/workspaces"
          isActive={pathname === "/workspaces"}
        />
        <Tab
          label={t("documents")}
          icon={<FileTextIcon width={16} height={16} color="white" />}
          path="/documents"
          isActive={pathname === "/documents"}
        />
        <Tab
          label={t("repositories")}
          icon={<StackIcon width={16} height={16} color="white" />}
          path="/topic-spaces"
          isActive={pathname === "/topic-spaces"}
        />
        <Tab
          label={t("accountSettings")}
          icon={<GearIcon width={16} height={16} color="white" />}
          path="/account"
          isActive={pathname === "/account"}
        />
      </div>
    </div>
  );
};

export const TabsContainer = ({ children }: { children: React.ReactNode }) => {
  const t = useTranslations("tab");
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [topicSpaceCreateModalOpen, setTopicSpaceCreateModalOpen] =
    useState<boolean>(false);

  const { mutate: createEmptyWorkspace } =
    api.workspace.createEmpty.useMutation();

  const moveToNewWorkspace = () => {
    createEmptyWorkspace(
      {},
      {
        onSuccess: (res) => {
          router.push(`/workspaces/${res?.id}`);
        },
      },
    );
  };

  const NewContentButton = () => {
    switch (pathname) {
      case "/dashboard":
        return (
          <Button
            className="flex flex-row items-center gap-1"
            onClick={() => {
              router.push("/documents/new");
            }}
          >
            <PlusIcon width={16} height={16} color="white" />
            <div className="text-sm">{t("newDocument")}</div>
          </Button>
        );
      case "/documents":
        return (
          <Button
            className="flex flex-row items-center gap-1"
            onClick={() => {
              router.push("/documents/new");
            }}
          >
            <PlusIcon width={16} height={16} color="white" />
            <div className="text-sm">{t("newDocument")}</div>
          </Button>
        );
      case "/topic-spaces":
        return (
          <Button
            className="flex flex-row items-center gap-1"
            onClick={() => {
              setTopicSpaceCreateModalOpen(true);
            }}
          >
            <PlusIcon width={16} height={16} color="white" />
            <div className="text-sm">{t("newRepository")}</div>
          </Button>
        );
      case "/workspaces":
        return (
          <Button
            className="flex flex-row items-center gap-1"
            onClick={() => {
              moveToNewWorkspace();
            }}
          >
            <PlusIcon width={16} height={16} color="white" />
            <div className="text-sm">{t("newWorkspace")}</div>
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full w-full p-2">
      <div className="flex h-full w-full flex-col divide-y divide-slate-400 overflow-hidden rounded-md border border-slate-400 text-slate-50">
        <div className="flex flex-row items-center justify-between">
          <Tabs session={session} />

          <div className="px-4">
            <NewContentButton />
          </div>
        </div>

        {children}
      </div>
      {!!session && (
        <TopicSpaceCreateModal
          isOpen={topicSpaceCreateModalOpen}
          setIsOpen={setTopicSpaceCreateModalOpen}
        />
      )}
    </div>
  );
};
