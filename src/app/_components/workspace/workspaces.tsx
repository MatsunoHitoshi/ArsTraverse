"use client";
import { api } from "@/trpc/react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { TabsContainer } from "../tab/tab";
import WorkspaceList from "../list/workspace-list";
import { PlusIcon } from "../icons";
import { Button } from "../button/button";
import { useRouter } from "next/navigation";

export const Workspaces = () => {
  const { data: session } = useSession();
  const { data: workspaces, refetch } =
    api.workspace.getListBySession.useQuery();
  const [deleteIntentId, setDeleteIntentId] = useState<string>();
  const { mutate: createEmptyWorkspace } =
    api.workspace.createEmpty.useMutation();

  const router = useRouter();

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

  if (!session) return null;
  return (
    <TabsContainer>
      <div className="flex flex-row gap-4 p-4">
        <div className="w-1/2">
          {workspaces && <WorkspaceList workspaces={workspaces} />}
        </div>
      </div>
    </TabsContainer>
  );
};
