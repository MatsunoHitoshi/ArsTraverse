"use client";
import { api } from "@/trpc/react";
import { useSession } from "next-auth/react";
import { DocumentList } from "../list/document-list";
import { TabsContainer } from "../tab/tab";
import { Button } from "../button/button";
import { PlusIcon, TrashIcon } from "../icons";
import { TopicSpaceList } from "../list/topic-space-list";
import type { TopicSpaceResponse } from "@/app/const/types";
import { TopicSpaceCreateModal } from "../topic-space/topic-space-create-modal";
import { useState } from "react";
import {
  DeleteRecordModal,
  type DeleteRecordType,
} from "../modal/delete-record-modal";
import Link from "next/link";

export const Dashboard = () => {
  const { data: session } = useSession();
  const { data: documents, refetch: refetchDocuments } =
    api.sourceDocument.getListBySession.useQuery();
  const { data: topicSpaces, refetch: refetchTopicSpaces } =
    api.topicSpaces.getListBySession.useQuery();
  const [topicSpaceCreateModalOpen, setTopicSpaceCreateModalOpen] =
    useState<boolean>(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deleteIntent, setDeleteIntent] = useState<{
    id: string;
    type: DeleteRecordType;
  }>();

  if (!session) return null;
  return (
    <>
      <TabsContainer>
        <div className="grid  grid-flow-row grid-cols-2 gap-8  p-4">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-1">
              <div className="flex flex-row items-center justify-between">
                <div className="text-lg font-semibold">最近のドキュメント</div>
                <Link href="/">
                  <Button className="!h-8 !w-8 !p-2">
                    <div className="h-4 w-4">
                      <PlusIcon width={16} height={16} color="white" />
                    </div>
                  </Button>
                </Link>
              </div>

              {documents && (
                <DocumentList
                  documents={documents}
                  end={5}
                  menu={(document) => {
                    return (
                      <div className="flex min-w-[150px] flex-col">
                        <button
                          className="w-full px-2 py-1 hover:bg-slate-50/10"
                          onClick={() => {
                            setDeleteIntent({
                              id: document.id,
                              type: "sourceDocument",
                            });
                            setDeleteModalOpen(true);
                          }}
                        >
                          <div className="flex flex-row items-center gap-1">
                            <div className="h-4 w-4">
                              <TrashIcon
                                width={16}
                                height={16}
                                color="#ea1c0c"
                              />
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
            <div className="flex flex-col gap-1">
              <div className="h-8 text-lg font-semibold">
                最近のアクティビティ
              </div>
              {/* {documents && <DocumentList documents={documents} end={5} />} */}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center justify-between">
              <div className="text-lg font-semibold">リポジトリ</div>
              <Button
                onClick={() => {
                  console.log("topicSpaceCreateModalOpen -> true");
                  setTopicSpaceCreateModalOpen(true);
                }}
                className="!h-8 !w-8 !p-2"
              >
                <div className="h-4 w-4">
                  <PlusIcon width={16} height={16} color="white" />
                </div>
              </Button>
            </div>
            {topicSpaces && (
              <TopicSpaceList
                topicSpaces={topicSpaces as TopicSpaceResponse[]}
                end={5}
                setTopicSpaceCreateModalOpen={setTopicSpaceCreateModalOpen}
                menu={(topicSpace) => {
                  return (
                    <div className="flex min-w-[150px] flex-col">
                      <button
                        className="w-full px-2 py-1 hover:bg-slate-50/10"
                        onClick={() => {
                          setDeleteIntent({
                            id: topicSpace.id,
                            type: "topicSpace",
                          });
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
      </TabsContainer>

      <TopicSpaceCreateModal
        isOpen={topicSpaceCreateModalOpen}
        setIsOpen={setTopicSpaceCreateModalOpen}
      />
      {deleteIntent && (
        <DeleteRecordModal
          id={deleteIntent.id}
          type={deleteIntent.type}
          isOpen={deleteModalOpen}
          setIsOpen={setDeleteModalOpen}
          refetch={
            deleteIntent.type === "topicSpace"
              ? refetchTopicSpaces
              : refetchDocuments
          }
        />
      )}
    </>
  );
};
