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
import { useRouter } from "next/navigation";
import { TopicSpaceCreateModal } from "../topic-space/topic-space-create-modal";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import Link from "next/link";
import { api } from "@/trpc/react";

const Tab = ({
  label,
  icon,
  path,
}: {
  label: string;
  icon: React.ReactNode;
  path: string;
}) => {
  console.log("pathname", location.pathname, ",", path);
  return (
    <div
      className={`border-b-2 border-transparent ${location.pathname === path && "!border-slate-50 font-semibold"}`}
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
  if (!!session) {
    return (
      <div className="flex h-[46px] flex-row items-end gap-4">
        <Link href="/dashboard">
          <Button
            className={`flex flex-row items-center gap-1 rounded-none border-b-2 border-transparent bg-transparent !px-4 py-2 text-sm font-semibold ${location.pathname === "/dashboard" && "!border-slate-50"}`}
          >
            <div className="h-4 w-4">
              <DashboardIcon width={14} height={14} color="white" />
            </div>
            ダッシュボード
          </Button>
        </Link>

        <div className="flex flex-row items-end text-sm">
          <Tab
            label="ワークスペース"
            icon={<Pencil2Icon width={16} height={16} color="white" />}
            path={"/workspaces"}
          />
          <Tab
            label="ドキュメント"
            icon={<FileTextIcon width={16} height={16} color="white" />}
            path={"/documents"}
          />
          <Tab
            label="リポジトリ"
            icon={<StackIcon width={16} height={16} color="white" />}
            path={"/topic-spaces"}
          />
          <Tab
            label="アカウント設定"
            icon={<GearIcon width={16} height={16} color="white" />}
            path={"/account"}
          />
        </div>
      </div>
    );
  } else {
    <></>;
  }
};

export const TabsContainer = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
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
    switch (location.pathname) {
      case "/dashboard":
        return (
          <Button
            className="flex flex-row items-center gap-1"
            onClick={() => {
              router.push("/");
            }}
          >
            <PlusIcon width={16} height={16} color="white" />
            <div className="text-sm">新規ドキュメント</div>
          </Button>
        );
      case "/documents":
        return (
          <Button
            className="flex flex-row items-center gap-1"
            onClick={() => {
              router.push("/");
            }}
          >
            <PlusIcon width={16} height={16} color="white" />
            <div className="text-sm">新規ドキュメント</div>
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
            <div className="text-sm">新規リポジトリ</div>
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
            <div className="text-sm">新規ワークスペース</div>
          </Button>
        );
      default:
        return <></>;
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
