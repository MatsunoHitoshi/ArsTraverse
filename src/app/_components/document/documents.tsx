"use client";
import { api } from "@/trpc/react";
import { useSession } from "next-auth/react";
import { TabsContainer } from "../tab/tab";
import { DocumentList, DocumentListMenuButton } from "../list/document-list";
import { DocumentDetail } from "./document-detail";
import { Button } from "../button/button";
import { Pencil2Icon, PlusIcon, TrashIcon } from "../icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DeleteRecordModal } from "../modal/delete-record-modal";
import { DocumentEditModal } from "./document-edit-modal";
export const Documents = ({ id }: { id?: string }) => {
  const { data: session } = useSession();
  const { data: documents, refetch } =
    api.sourceDocument.getListBySession.useQuery();
  const document = documents?.find((document) => {
    return document.id === id;
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string>();
  const router = useRouter();
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editDocumentId, setEditDocumentId] = useState<string | null>(null);

  if (!session) return null;
  return (
    <TabsContainer>
      <div className="grid h-full grid-flow-row grid-cols-2 gap-8">
        <div className="flex flex-col gap-8 overflow-scroll p-4">
          <div className="flex flex-col gap-1 ">
            <div className="flex w-full flex-row items-center justify-between">
              <div className="text-lg font-semibold">ドキュメント</div>
              <Button
                onClick={() => {
                  router.push("/");
                }}
                className="!h-8 !w-8 !p-2"
              >
                <div className="h-4 w-4">
                  <PlusIcon width={16} height={16} color="white" />
                </div>
              </Button>
            </div>

            {documents && (
              <DocumentList
                documents={documents}
                id={id}
                menu={(document) => {
                  return (
                    <div className="flex min-w-[150px] flex-col">
                      <DocumentListMenuButton
                        icon={
                          <TrashIcon width={16} height={16} color="#ea1c0c" />
                        }
                        onClick={() => {
                          setDeleteDocumentId(document.id);
                          setDeleteModalOpen(true);
                        }}
                      >
                        <div className="text-error-red">削除</div>
                      </DocumentListMenuButton>
                      <DocumentListMenuButton
                        icon={
                          <Pencil2Icon width={16} height={16} color="white" />
                        }
                        onClick={() => {
                          setEditDocumentId(document.id);
                          setEditModalOpen(true);
                        }}
                      >
                        <div className="text-white">名前を編集</div>
                      </DocumentListMenuButton>
                    </div>
                  );
                }}
              />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {id && document ? (
            <DocumentDetail documentId={id} />
          ) : (
            <div className="rounded-md border border-slate-400 p-4">
              ドキュメントを選択してください
            </div>
          )}
        </div>
      </div>
      {deleteDocumentId && (
        <DeleteRecordModal
          id={deleteDocumentId}
          type="sourceDocument"
          isOpen={deleteModalOpen}
          setIsOpen={setDeleteModalOpen}
          refetch={refetch}
        />
      )}
      <DocumentEditModal
        isOpen={editModalOpen}
        setIsOpen={setEditModalOpen}
        documentId={editDocumentId}
        refetch={refetch}
      />
    </TabsContainer>
  );
};
