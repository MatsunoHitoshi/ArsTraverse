import type { DocumentResponse } from "@/app/const/types";
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

const DocumentAttachSchema = z.object({
  documents: z.array(z.string()),
});

type DocumentAttachModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  topicSpaceId: string;
  refetch: () => void;
};

interface DocumentAttachForm {
  documents: string[];
}

const emptyDocument: DocumentResponse = {
  id: "",
  name: "",
  url: "",
  userId: "",
  graph: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  isDeleted: false,
  documentType: "INPUT_TXT",
};

export const DocumentAttachModal = ({
  isOpen,
  setIsOpen,
  topicSpaceId,
  refetch,
}: DocumentAttachModalProps) => {
  const { data: session } = useSession();
  const { data: documents } = api.sourceDocument.getListBySession.useQuery();

  const [selectedDocuments, setSelectedDocuments] = useState<
    DocumentResponse[]
  >([emptyDocument]);
  const attachDocuments = api.topicSpaces.attachDocuments.useMutation();
  const [query, setQuery] = useState("");

  const filteredDocuments =
    query === ""
      ? documents
      : documents?.filter((document: DocumentResponse) => {
          return (
            document.name.toLowerCase().includes(query.toLowerCase()) &&
            !selectedDocuments.some((d) => {
              return d.id === document.id;
            })
          );
        }) ?? [];

  const submit: SubmitHandler<DocumentAttachForm> = (
    data: DocumentAttachForm,
  ) => {
    const attachDocumentIds = data.documents.filter((documentId) => {
      return documentId !== "";
    });
    attachDocuments.mutate(
      { id: topicSpaceId, documentIds: attachDocumentIds },
      {
        onSuccess: (res) => {
          setIsOpen(false);
          refetch();
          setSelectedDocuments([emptyDocument]);
        },
        onError: (e) => {
          console.log(e);
        },
      },
    );
  };
  const isInValid: SubmitErrorHandler<DocumentAttachForm> = (errors) => {
    console.log("Is Not Valid");
    console.log(errors);
  };
  const methods = useForm<DocumentAttachForm>({
    resolver: zodResolver(DocumentAttachSchema),
  });

  if (!filteredDocuments || !session) return null;

  const updateSelectDocuments = (
    index: number,
    selectedDocuments: DocumentResponse[],
    value: DocumentResponse,
  ) => {
    return selectedDocuments.map((document, i) => {
      return i === index ? value : document;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="リポジトリにドキュメントを追加"
    >
      <form onSubmit={methods.handleSubmit(submit, isInValid)}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            {selectedDocuments.map((document, index) => {
              return (
                <div
                  key={index}
                  className="flex w-full flex-row items-center gap-1"
                >
                  <Combobox
                    value={document}
                    onChange={(val) => {
                      const newDocuments = updateSelectDocuments(
                        index,
                        selectedDocuments,
                        val ?? emptyDocument,
                      );
                      setSelectedDocuments(newDocuments);
                      methods.setValue(
                        "documents",
                        newDocuments.map((document) => {
                          return document.id;
                        }) ?? "",
                      );
                    }}
                    onClose={() => setQuery("")}
                  >
                    <ComboboxInput
                      displayValue={(document: DocumentResponse) =>
                        document ? document.name : ""
                      }
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="ドキュメント名を入力"
                      className={clsx(
                        "w-full rounded-lg border-none bg-white/5 py-1.5 pl-3 pr-8 text-sm/6 text-white",
                        "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
                      )}
                    />
                    <ComboboxOptions
                      anchor="bottom start"
                      className="z-50 max-w-[300px] divide-y divide-slate-400 rounded-md border bg-slate-900 empty:invisible"
                    >
                      {filteredDocuments.map((document) => (
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
                        setSelectedDocuments(
                          selectedDocuments.filter((_document, i) => {
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
                    selectedDocuments[selectedDocuments.length - 1]?.id !== ""
                  ) {
                    setSelectedDocuments([...selectedDocuments, emptyDocument]);
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
