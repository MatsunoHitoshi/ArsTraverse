import type { TopicSpaceResponse } from "@/app/const/types";
import { Modal } from "../modal/modal";
import {
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import clsx from "clsx";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import type { SubmitErrorHandler, SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../button/button";
import { MinusIcon, PlusIcon } from "../icons";
import { TopicSpace } from "@prisma/client";

const DocumentAttachSchema = z.object({
  documents: z.array(z.string()),
});

type TopicSpaceAttachModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceId: string;
  refetch: () => void;
};

const emptyTopicSpace: TopicSpaceResponse = {
  id: "",
  name: "",
  description: "",
  image: null,
  star: 0,
  mcpToolIdentifier: null,
  sourceDocuments: null,
  graphData: null,
  graphDataStatus: "QUEUED",
  createdAt: new Date(),
  updatedAt: new Date(),
  isDeleted: false,
};

interface TopicSpaceAttachForm {
  documents: string[];
}

export const TopicSpaceAttachModal = ({
  isOpen,
  setIsOpen,
  workspaceId,
  refetch,
}: TopicSpaceAttachModalProps) => {
  const { data: session } = useSession();
  const { data: topicSpaces } = api.topicSpaces.getListBySession.useQuery();

  const [selectedTopicSpaces, setSelectedTopicSpaces] = useState<
    TopicSpaceResponse[]
  >([emptyTopicSpace]);
  const attachTopicSpace = api.workspace.update.useMutation();
  const [query, setQuery] = useState("");

  const filteredTopicSpaces =
    query === ""
      ? topicSpaces
      : topicSpaces?.filter((topicSpace) => {
          return (
            topicSpace.name.toLowerCase().includes(query.toLowerCase()) &&
            !selectedTopicSpaces.some((d) => {
              return d.id === topicSpace.id;
            })
          );
        }) ?? [];

  const submit: SubmitHandler<TopicSpaceAttachForm> = (
    data: TopicSpaceAttachForm,
  ) => {
    const attachDocumentIds = data.documents.filter((documentId) => {
      return documentId !== "";
    });
    attachTopicSpace.mutate(
      { id: workspaceId, referencedTopicSpaceIds: attachDocumentIds },
      {
        onSuccess: (res) => {
          setIsOpen(false);
          refetch();
          setSelectedTopicSpaces([]);
        },
        onError: (e) => {
          console.log(e);
        },
      },
    );
  };
  const isInValid: SubmitErrorHandler<TopicSpaceAttachForm> = (errors) => {
    console.log("Is Not Valid");
    console.log(errors);
  };
  const methods = useForm<TopicSpaceAttachForm>({
    resolver: zodResolver(DocumentAttachSchema),
  });

  if (!filteredTopicSpaces || !session) return null;

  const updateSelectTopicSpaces = (
    index: number,
    selectedDocuments: TopicSpaceResponse[],
    value: TopicSpaceResponse,
  ) => {
    return selectedDocuments.map((document, i) => {
      return i === index ? value : document;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="参照するリポジトリを追加"
    >
      <form onSubmit={methods.handleSubmit(submit, isInValid)}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            {selectedTopicSpaces.map((topicSpace, index) => {
              return (
                <div
                  key={index}
                  className="flex w-full flex-row items-center gap-1"
                >
                  <Combobox
                    value={topicSpace}
                    onChange={(val) => {
                      const newTopicSpaces = updateSelectTopicSpaces(
                        index,
                        selectedTopicSpaces,
                        val ?? emptyTopicSpace,
                      );
                      setSelectedTopicSpaces(newTopicSpaces);
                      methods.setValue(
                        "documents",
                        newTopicSpaces.map((document) => {
                          return document.id;
                        }) ?? "",
                      );
                    }}
                    onClose={() => setQuery("")}
                  >
                    <ComboboxInput
                      displayValue={(topicSpaces: TopicSpace) =>
                        topicSpaces ? topicSpaces.name : ""
                      }
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="リポジトリ名を入力"
                      className={clsx(
                        "w-full rounded-lg border-none bg-white/5 py-1.5 pl-3 pr-8 text-sm/6 text-white",
                        "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
                      )}
                    />
                    <ComboboxOptions
                      anchor="bottom start"
                      className="z-50 max-w-[300px] divide-y divide-slate-400 rounded-md border bg-slate-900 empty:invisible"
                    >
                      {filteredTopicSpaces.map((document) => (
                        <ComboboxOption
                          key={document.id}
                          value={document}
                          className="cursor-pointer p-2 text-slate-50 data-[focus]:bg-slate-400 data-[focus]:text-black"
                        >
                          {document.name}
                        </ComboboxOption>
                      ))}
                    </ComboboxOptions>
                  </Combobox>
                  {index !== 0 && (
                    <Button
                      onClick={() => {
                        setSelectedTopicSpaces(
                          selectedTopicSpaces.filter((_document, i) => {
                            return i !== index;
                          }),
                        );
                      }}
                      className="!h-8 !w-8 !p-2"
                    >
                      <div className="h-4 w-4">
                        <MinusIcon width={16} height={16} color="white" />
                      </div>
                    </Button>
                  )}
                </div>
              );
            })}
            <div className="flex w-full flex-row justify-end">
              <Button
                onClick={() => {
                  if (
                    selectedTopicSpaces[selectedTopicSpaces.length - 1]?.id !==
                    ""
                  ) {
                    setSelectedTopicSpaces([
                      ...selectedTopicSpaces,
                      emptyTopicSpace,
                    ]);
                  }
                }}
                className="!h-8 !w-8 !p-2"
              >
                <div className="h-4 w-4">
                  <PlusIcon width={16} height={16} color="white" />
                </div>
              </Button>
            </div>
          </div>

          <div className="flex flex-row justify-end">
            <Button type="submit" className="text-sm">
              追加
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
