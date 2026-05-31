"use client";
import { api } from "@/trpc/react";
import { useSession } from "next-auth/react";
import { TabsContainer } from "../tab/tab";
import type { TopicSpaceResponse } from "@/app/const/types";
import { TopicSpaceList } from "../list/topic-space-list";
import { useState } from "react";
import { TopicSpaceCreateModal } from "./topic-space-create-modal";
import { TopicSpaceRenameModal } from "./topic-space-rename-modal";
import { TrashIcon, Pencil2Icon } from "../icons";
import { DeleteRecordModal } from "../modal/delete-record-modal";

export const TopicSpaces = () => {
  const { data: session } = useSession();
  const { data: topicSpaces, refetch } =
    api.topicSpaces.getListBySession.useQuery();
  const [topicSpaceCreateModalOpen, setTopicSpaceCreateModalOpen] =
    useState<boolean>(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deleteIntentId, setDeleteIntentId] = useState<string>();
  const [renameModalOpen, setRenameModalOpen] = useState<boolean>(false);
  const [renameIntentTopicSpace, setRenameIntentTopicSpace] =
    useState<TopicSpaceResponse | null>(null);

  if (!session) return null;
  return (
    <TabsContainer>
      <div className="grid h-full grid-flow-row grid-cols-2 gap-8 overflow-scroll p-4">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2 ">
            {topicSpaces && (
              <TopicSpaceList
                topicSpaces={topicSpaces as TopicSpaceResponse[]}
                setTopicSpaceCreateModalOpen={setTopicSpaceCreateModalOpen}
                menu={(topicSpace) => {
                  return (
                    <div className="flex min-w-[150px] flex-col">
                      <button
                        className="w-full px-2 py-1 hover:bg-slate-50/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameIntentTopicSpace(topicSpace);
                          setRenameModalOpen(true);
                        }}
                      >
                        <div className="flex flex-row items-center gap-1">
                          <div className="h-4 w-4">
                            <Pencil2Icon
                              width={16}
                              height={16}
                              color="white"
                            />
                          </div>
                          <div>名称変更</div>
                        </div>
                      </button>
                      <button
                        className="w-full px-2 py-1 hover:bg-slate-50/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteIntentId(topicSpace.id);
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
        <div className="flex flex-col gap-2"></div>
      </div>
      {session && (
        <TopicSpaceCreateModal
          isOpen={topicSpaceCreateModalOpen}
          setIsOpen={setTopicSpaceCreateModalOpen}
        />
      )}

      <TopicSpaceRenameModal
        isOpen={renameModalOpen}
        setIsOpen={setRenameModalOpen}
        topicSpace={renameIntentTopicSpace ?? null}
        onSuccess={() => refetch()}
      />

      {deleteIntentId && (
        <DeleteRecordModal
          id={deleteIntentId}
          type="topicSpace"
          isOpen={deleteModalOpen}
          setIsOpen={setDeleteModalOpen}
          refetch={refetch}
        />
      )}
    </TabsContainer>
  );
};
