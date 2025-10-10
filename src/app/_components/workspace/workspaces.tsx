"use client";
import { api } from "@/trpc/react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { TabsContainer } from "../tab/tab";
import WorkspaceList from "../list/workspace-list";
import { PlusIcon, TrashIcon } from "../icons";
import { Button } from "../button/button";
import { useRouter } from "next/navigation";
import { DeleteRecordModal } from "../modal/delete-record-modal";

export const Workspaces = () => {
  const { data: session } = useSession();
  const { data: workspaces, refetch } =
    api.workspace.getListBySession.useQuery();
  const [deleteIntentId, setDeleteIntentId] = useState<string>();
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
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
          {workspaces && (
            <WorkspaceList
              workspaces={workspaces}
              menu={(workspace) => {
                return (
                  <div className="flex min-w-[150px] flex-col">
                    <button
                      className="w-full px-2 py-1 hover:bg-slate-50/10"
                      onClick={() => {
                        setDeleteIntentId(workspace.id);
                        setDeleteModalOpen(true);
                      }}
                    >
                      <div className="flex flex-row items-center gap-1">
                        <div className="h-4 w-4">
                          <TrashIcon width={16} height={16} color="#ea1c0c" />
                        </div>
                        <div className="text-error-red">削除</div>
                      </div>
                    </button>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {deleteIntentId && (
        <DeleteRecordModal
          id={deleteIntentId}
          type="workspace"
          isOpen={deleteModalOpen}
          setIsOpen={setDeleteModalOpen}
          refetch={refetch}
        />
      )}
    </TabsContainer>
  );
};
