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
import type { WorkspaceResponse } from "@/app/const/types";
import { ReadOnlyTipTapViewer } from "../article/read-only-tiptap-viewer";
import type { JSONContent } from "@tiptap/react";

const normalizePreviewContent = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizePreviewContent(item))
      .filter((item) => item !== null);
  }
  if (typeof value !== "object" || value === null) return value;

  const record = value as Record<string, unknown>;
  if (
    record.type === "text" &&
    typeof record.text === "string" &&
    record.text.length === 0
  ) {
    return null;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === "type" && child === "strong") {
      normalized[key] = "bold";
      continue;
    }
    const normalizedChild = normalizePreviewContent(child);
    if (normalizedChild === null) continue;
    normalized[key] = normalizedChild;
  }
  return normalized;
};

export const Workspaces = () => {
  const { data: session } = useSession();
  const { data: workspaces, refetch } =
    api.workspace.getListBySession.useQuery();
  const [deleteIntentId, setDeleteIntentId] = useState<string>();
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [hoveredWorkspace, setHoveredWorkspace] = useState<WorkspaceResponse | null>(
    null,
  );
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
              onWorkspaceHover={(workspace) => {
                setHoveredWorkspace(workspace);
              }}
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
        <div className="w-1/2 rounded-md  bg-slate-900/50 p-3">
          {hoveredWorkspace?.content ? (
            <div className="h-full">
              <div className="mb-2 text-sm text-slate-300 font-bold">
                {hoveredWorkspace.name}
              </div>
              <ReadOnlyTipTapViewer
                content={normalizePreviewContent(
                  hoveredWorkspace.content,
                ) as JSONContent}
                entities={[]}
              />
            </div>
          ) : (
            <div className="flex h-[460px] items-center justify-center text-sm text-slate-500">
              ワークスペースにホバーすると、ここに内容プレビューが表示されます。
            </div>
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
