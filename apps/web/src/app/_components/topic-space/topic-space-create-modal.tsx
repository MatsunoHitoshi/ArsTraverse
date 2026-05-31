import type { DocumentResponse } from "@/app/const/types";
import { Modal } from "../modal/modal";
import {
  Input,
  Textarea,
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import type { SubmitErrorHandler, SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../button/button";
import clsx from "clsx";

const TopicSpaceCreateSchema = z.object({
  name: z.string(),
  image: z.string().url().optional(),
  description: z.string().optional(),
  documentId: z.string().optional(),
});

type TopicSpaceCreateModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

interface TopicSpaceCreateForm {
  name: string;
  description?: string;
  image?: string;
  documentId: string;
}

export const TopicSpaceCreateModal = ({
  isOpen,
  setIsOpen,
}: TopicSpaceCreateModalProps) => {
  const { data: session } = useSession();
  const { data: documentsData } =
    api.sourceDocument.getListBySession.useQuery();
  const documents = documentsData?.items;
  const [selectedDocument, setSelectedDocument] =
    useState<DocumentResponse | null>(null);
  const createTopicSpace = api.topicSpaces.create.useMutation();
  const [query, setQuery] = useState("");
  const router = useRouter();

  const filteredDocuments =
    query === ""
      ? documents
      : (documents?.filter((document: DocumentResponse) => {
          return document.name.toLowerCase().includes(query.toLowerCase());
        }) ?? []);

  const submit: SubmitHandler<TopicSpaceCreateForm> = (
    data: TopicSpaceCreateForm,
  ) => {
    createTopicSpace.mutate(data, {
      onSuccess: (res) => {
        console.log("res: ", res);
        router.push(`/topic-spaces/${res.id}`);
      },
      onError: (e) => {
        console.log(e);
      },
    });
  };
  const isInValid: SubmitErrorHandler<TopicSpaceCreateForm> = (errors) => {
    console.log("Is Not Valid");
    console.log(errors);
  };
  const methods = useForm<TopicSpaceCreateForm>({
    resolver: zodResolver(TopicSpaceCreateSchema),
  });

  if (!filteredDocuments || !session) return null;

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title="リポジトリを作成">
      <form onSubmit={methods.handleSubmit(submit, isInValid)}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold">マップの名前</div>
            <Input
              type="text"
              placeholder="名前を入力"
              className={clsx(
                "block w-full rounded-lg border-none bg-white/5 px-3 py-1.5 text-sm/6",
                "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
              )}
              {...methods.register("name", {
                required: "必須入力です",
              })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold">説明</div>
            <Textarea
              placeholder="説明を入力"
              className={clsx(
                "block w-full resize-none rounded-lg border-none bg-white/5 px-3 py-1.5 text-sm/6 text-white",
                "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
              )}
              rows={3}
              {...methods.register("description")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold">ドキュメントを選択</div>
            <Combobox
              value={selectedDocument}
              onChange={(val) => {
                methods.setValue("documentId", val?.id ?? "");
                setSelectedDocument(val);
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
          </div>
          <div className="flex flex-row justify-end">
            <Button type="submit" className="text-sm">
              作成
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
