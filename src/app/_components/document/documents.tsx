"use client";
import { api } from "@/trpc/react";
import { useSession } from "next-auth/react";
import { TabsContainer } from "../tab/tab";
import { DocumentList, DocumentListMenuButton } from "../list/document-list";
import { DocumentDetail } from "./document-detail";
import { Pencil2Icon, TrashIcon } from "../icons";
import { useState } from "react";
import { DeleteRecordModal } from "../modal/delete-record-modal";
import { DocumentEditModal } from "./document-edit-modal";
import { Pagination } from "../pagination/pagination";
export const Documents = ({ id }: { id?: string }) => {
  const { data: session } = useSession();
  const [page, setPage] = useState(1);
  const { data, refetch } = api.sourceDocument.getListBySession.useQuery({
    page,
    limit: 30,
  });
  const documents = data?.items;

  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string>();
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editDocumentId, setEditDocumentId] = useState<string | null>(null);

  if (!session) return null;
  return (
    <TabsContainer>
      <div className="grid h-full grid-flow-row grid-cols-2 gap-8 overflow-hidden">
        <div className="flex h-full flex-col gap-8 overflow-scroll p-4">
          <div className="flex flex-col gap-1 ">
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
            <Pagination
              currentPage={page}
              totalPages={data?.totalPages ?? 1}
              onPageChange={setPage}
              className="mt-4"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {id ? (
            <DocumentDetail documentId={id} />
          ) : (
            <div className="m-4 rounded-md border border-slate-400 p-4">
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
