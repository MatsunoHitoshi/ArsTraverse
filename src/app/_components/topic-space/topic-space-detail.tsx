"use client";
import { api } from "@/trpc/react";
import { useSession } from "next-auth/react";
import { TabsContainer } from "../tab/tab";
import type { GraphDocumentForFrontend } from "@/app/const/types";
import {
  FileTextIcon,
  GraphIcon,
  LayersIcon,
  Pencil2Icon,
  PersonIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
} from "../icons";
import { DocumentList, DocumentListMenuButton } from "../list/document-list";
import type { DocumentResponse } from "@/app/const/types";
import { Button } from "../button/button";
import { Fragment, useState } from "react";
import { DocumentAttachModal } from "./document-attach-modal";
import { LinkButton } from "../button/link-button";
import { MultiDocumentGraphViewer } from "../view/graph-view/multi-document-graph-viewer";
import { DocumentEditModal } from "../document/document-edit-modal";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { TopicSpaceChangeHistory } from "./topic-space-change-history";
import { ProposalList } from "../graph-edit-proposal/proposal-list";

export const TopicSpaceDetail = ({ id }: { id: string }) => {
  const { data: session } = useSession();
  const { data: topicSpace, refetch } = api.topicSpaces.getById.useQuery({
    id: id,
  });
  const detachDocument = api.topicSpaces.detachDocument.useMutation();
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(
    null,
  );

  const onDetachDocument = (documentId: string) => {
    detachDocument.mutate(
      { id: id, documentId },
      {
        onSuccess: (res) => {
          console.log("res: ", res);
          refetch().catch((error) => {
            console.error("Refetch error: ", error);
          });
        },
        onError: (e) => {
          console.log(e);
        },
      },
    );
  };

  const [documentAttachModalOpen, setDocumentAttachModalOpen] =
    useState<boolean>(false);
  const [documentEditModalOpen, setDocumentEditModalOpen] =
    useState<boolean>(false);
  const [documentId, setDocumentId] = useState<string | null>(null);

  if (!session || !topicSpace) return null;
  return (
    <TabsContainer>
      <div className="grid h-full grid-flow-row grid-cols-2 gap-8 overflow-hidden">
        <div className="flex h-full flex-col gap-8 overflow-hidden p-4">
          <a href={`/topic-spaces/${id}`} className="w-max">
            <div className="text-lg font-semibold">{topicSpace.name}</div>
          </a>

          <div className="flex flex-col gap-3">
            <div className="text-sm">{topicSpace.description}</div>

            <div className="flex flex-row items-center gap-1">
              {topicSpace.tags?.map((tag) => {
                return (
                  <div
                    key={tag.id}
                    className="rounded-sm bg-slate-50/10 p-1 text-sm"
                  >
                    {tag.name}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-row items-center justify-between">
              <div className="flex flex-row items-center justify-start gap-4 py-2">
                <div className="flex flex-col items-center">
                  <div className="flex flex-row items-center gap-2">
                    <PersonIcon height={20} width={20} color="white" />
                    <div className="">{topicSpace.admins?.length ?? "-"}</div>
                  </div>
                  <div className="text-sm">メンバー数</div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="flex flex-row items-center gap-2">
                    <StarIcon height={20} width={20} color="white" />
                    <div className="">{topicSpace.star}</div>
                  </div>
                  <div className="text-sm">お気に入り数</div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="flex flex-row items-center gap-2">
                    <FileTextIcon height={20} width={20} color="white" />
                    <div className="">
                      {topicSpace.sourceDocuments?.length ?? 0}
                    </div>
                  </div>
                  <div className="text-sm">ドキュメント数</div>
                </div>
              </div>

              <div className="flex flex-row items-center gap-1">
                <LinkButton href={`/topic-spaces/${id}/edit`} className="">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex flex-row items-center gap-2">
                      <GraphIcon height={20} width={20} color="white" />
                    </div>
                    <div className="text-sm">編集する</div>
                  </div>
                </LinkButton>

                <LinkButton href={`/topic-spaces/${id}/graph`} className="">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex flex-row items-center gap-2">
                      <GraphIcon height={20} width={20} color="white" />
                    </div>
                    <div className="text-sm">公開ページ</div>
                  </div>
                </LinkButton>
              </div>
            </div>
          </div>

          <TabGroup className="h-max overflow-y-scroll" defaultIndex={0}>
            <TabList className="sticky top-0 z-10 flex flex-row items-center gap-2 border-b border-slate-600 bg-slate-900 text-sm">
              <Tab as={Fragment}>
                {({ hover, selected }) => (
                  <div
                    className={`flex cursor-pointer flex-row items-center gap-1 rounded-t-sm px-3 py-2 text-sm font-semibold ${
                      selected ? "border-b-2 border-white outline-none" : ""
                    } ${hover ? "bg-white/10" : ""}`}
                  >
                    <div className="h-4 w-4">
                      <FileTextIcon width={16} height={16} color="white" />
                    </div>
                    <div className="text-sm">ドキュメント</div>
                  </div>
                )}
              </Tab>
              <Tab as={Fragment}>
                {({ hover, selected }) => (
                  <div
                    className={`flex cursor-pointer flex-row items-center gap-1 rounded-t-sm px-3 py-2 text-sm font-semibold ${
                      selected ? "border-b-2 border-white outline-none" : ""
                    } ${hover ? "bg-white/10" : ""}`}
                  >
                    <div className="h-4 w-4">
                      <FileTextIcon width={16} height={16} color="white" />
                    </div>
                    <div className="text-sm">変更提案</div>
                  </div>
                )}
              </Tab>
              <Tab as={Fragment}>
                {({ hover, selected }) => (
                  <div
                    className={`flex cursor-pointer flex-row items-center gap-1 rounded-t-sm px-3 py-2 text-sm font-semibold ${
                      selected ? "border-b-2 border-white outline-none" : ""
                    } ${hover ? "bg-white/10" : ""}`}
                  >
                    <div className="h-4 w-4">
                      <LayersIcon width={16} height={16} color="white" />
                    </div>
                    <div className="text-sm">変更履歴</div>
                  </div>
                )}
              </Tab>
            </TabList>
            <TabPanels className="py-2">
              <TabPanel>
                <div className="flex flex-col gap-1">
                  <div className="flex w-full flex-row items-center justify-end">
                    <Button
                      onClick={() => {
                        setDocumentAttachModalOpen(true);
                      }}
                      className="flex flex-row items-center"
                    >
                      <div className="h-4 w-4">
                        <PlusIcon width={16} height={16} color="white" />
                      </div>
                      <div className="text-sm">ドキュメントを追加</div>
                    </Button>
                  </div>
                  <DocumentList
                    documents={topicSpace.sourceDocuments as DocumentResponse[]}
                    type="topic"
                    menu={(document) => {
                      return (
                        <div className="flex min-w-[150px] flex-col">
                          <DocumentListMenuButton
                            icon={
                              <TrashIcon
                                width={16}
                                height={16}
                                color="#ea1c0c"
                              />
                            }
                            onClick={() => onDetachDocument(document.id)}
                          >
                            <div className="text-error-red">
                              リポジトリから削除
                            </div>
                          </DocumentListMenuButton>
                          <DocumentListMenuButton
                            icon={
                              <Pencil2Icon
                                width={16}
                                height={16}
                                color="white"
                              />
                            }
                            onClick={() => {
                              setDocumentId(document.id);
                              setDocumentEditModalOpen(true);
                            }}
                          >
                            <div className="text-white">名前を編集</div>
                          </DocumentListMenuButton>
                        </div>
                      );
                    }}
                  />
                </div>
              </TabPanel>
              <TabPanel>
                <ProposalList topicSpaceId={id} />
              </TabPanel>
              <TabPanel>
                <TopicSpaceChangeHistory topicSpaceId={id} />
              </TabPanel>
            </TabPanels>
          </TabGroup>
        </div>
        <div className="h-full overflow-scroll">
          {topicSpace.graphData ? (
            <MultiDocumentGraphViewer
              graphDocument={topicSpace.graphData as GraphDocumentForFrontend}
              topicSpaceId={id}
              refetch={refetch}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center p-4">
              <div>まだグラフが作成されていません</div>
              <div>{topicSpace.graphDataStatus}</div>
            </div>
          )}
        </div>
      </div>

      <DocumentAttachModal
        isOpen={documentAttachModalOpen}
        setIsOpen={setDocumentAttachModalOpen}
        topicSpaceId={id}
        refetch={refetch}
      />
      <DocumentEditModal
        isOpen={documentEditModalOpen}
        setIsOpen={setDocumentEditModalOpen}
        documentId={documentId}
        refetch={refetch}
      />
    </TabsContainer>
  );
};
