import type { TopicSpaceResponse } from "@/app/const/types";
import { Modal } from "../modal/modal";
import {
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import clsx from "clsx";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import type { SubmitErrorHandler, SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../button/button";
import { MinusIcon, Link2Icon } from "../icons";
import { TextInput } from "../input/text-input";
import type { TopicSpace } from "@prisma/client";

const TopicSpaceAttachSchema = z.object({
  topicSpaces: z.array(z.string()),
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
  topicSpaces: string[];
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
  const [sharedTopicSpaceId, setSharedTopicSpaceId] = useState("");
  const [sharedTopicSpaceError, setSharedTopicSpaceError] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "id">("search");
  const [searchedTopicSpace, setSearchedTopicSpace] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [searchId, setSearchId] = useState<string>("");

  const methods = useForm<TopicSpaceAttachForm>({
    resolver: zodResolver(TopicSpaceAttachSchema),
  });

  // tRPCクエリ（動的なIDで検索）
  const {
    data: publicTopicSpace,
    isLoading: isPublicTopicSpaceLoading,
    error: publicTopicSpaceError,
  } = api.topicSpaces.getByIdPublic.useQuery(
    { id: searchId },
    {
      enabled: !!searchId && searchId.trim() !== "",
      retry: false,
    },
  );

  const handleTabChange = (tab: "search" | "id") => {
    setActiveTab(tab);
    // タブ切り替え時に状態をリセット
    setQuery("");
    setSharedTopicSpaceId("");
    setSharedTopicSpaceError("");
    setSearchedTopicSpace(null);
    setSearchId("");
  };

  // デバウンス用のuseEffect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (activeTab === "id" && sharedTopicSpaceId.trim()) {
        setSearchId(sharedTopicSpaceId);
      } else if (activeTab === "id" && !sharedTopicSpaceId.trim()) {
        setSearchId("");
        setSearchedTopicSpace(null);
        setSharedTopicSpaceError("");
      }
    }, 500); // 500msのデバウンス

    return () => clearTimeout(timeoutId);
  }, [sharedTopicSpaceId, activeTab]);

  // tRPCクエリの結果を処理
  useEffect(() => {
    if (publicTopicSpace && !isPublicTopicSpaceLoading) {
      const topicSpaceResponse: TopicSpaceResponse = {
        id: publicTopicSpace.id,
        name: publicTopicSpace.name,
        description: publicTopicSpace.description ?? "",
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

      setSearchedTopicSpace({
        id: publicTopicSpace.id,
        name: publicTopicSpace.name,
      });

      // 自動でsetValue
      setSelectedTopicSpaces([topicSpaceResponse]);
      methods.setValue("topicSpaces", [publicTopicSpace.id]);
      setSharedTopicSpaceError("");
    } else if (publicTopicSpaceError && !isPublicTopicSpaceLoading) {
      setSearchedTopicSpace(null);
      setSelectedTopicSpaces([emptyTopicSpace]);
      methods.setValue("topicSpaces", []);
      setSharedTopicSpaceError("リポジトリが見つかりません");
    }
  }, [
    publicTopicSpace,
    publicTopicSpaceError,
    isPublicTopicSpaceLoading,
    methods,
  ]);

  const filteredTopicSpaces =
    query === ""
      ? topicSpaces
      : (topicSpaces?.filter((topicSpace) => {
          return (
            topicSpace.name.toLowerCase().includes(query.toLowerCase()) &&
            !selectedTopicSpaces.some((d) => {
              return d.id === topicSpace.id;
            })
          );
        }) ?? []);

  const submit: SubmitHandler<TopicSpaceAttachForm> = (
    data: TopicSpaceAttachForm,
  ) => {
    const attachTopicSpaceIds = data.topicSpaces.filter((topicSpaceId) => {
      return topicSpaceId !== "";
    });
    attachTopicSpace.mutate(
      { id: workspaceId, referencedTopicSpaceIds: attachTopicSpaceIds },
      {
        onSuccess: (_res) => {
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
          {/* タブ切り替えUI */}
          <div className="flex flex-row items-end gap-4">
            <div
              className={clsx(
                "border-b-2 border-transparent",
                activeTab === "search" && "!border-slate-50 font-semibold",
              )}
            >
              <Button
                type="button"
                onClick={() => handleTabChange("search")}
                className="flex cursor-pointer flex-row items-center gap-1 bg-transparent py-2 hover:bg-slate-50/10"
              >
                <div className="text-sm">検索で追加</div>
              </Button>
            </div>
            <div
              className={clsx(
                "border-b-2 border-transparent",
                activeTab === "id" && "!border-slate-50 font-semibold",
              )}
            >
              <Button
                type="button"
                onClick={() => handleTabChange("id")}
                className="flex cursor-pointer flex-row items-center gap-1 bg-transparent py-2 hover:bg-slate-50/10"
              >
                <div className="h-4 w-4">
                  <Link2Icon width={16} height={16} color="white" />
                </div>
                <div className="text-sm">IDで追加</div>
              </Button>
            </div>
          </div>

          {/* タブコンテンツ */}
          {activeTab === "search" ? (
            /* 検索タブ */
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
                          "topicSpaces",
                          newTopicSpaces.map((topicSpace) => {
                            return topicSpace.id;
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
            </div>
          ) : (
            /* IDタブ */
            <div className="flex flex-col gap-2">
              <div className="text-sm text-white">
                共有されたリポジトリを追加
              </div>
              <div className="flex flex-col gap-2">
                <TextInput
                  value={sharedTopicSpaceId}
                  onChange={(value) => {
                    setSharedTopicSpaceId(value);
                    setSharedTopicSpaceError("");
                  }}
                  placeholder="リポジトリのIDを入力"
                />

                {/* 検索結果の表示 */}
                {isPublicTopicSpaceLoading && searchId && (
                  <div className="text-sm text-slate-400">検索中...</div>
                )}

                {searchedTopicSpace && !isPublicTopicSpaceLoading && (
                  <div className="rounded-lg border border-green-500/30 bg-green-900/20 p-3">
                    <div>
                      <p className="text-sm font-medium text-green-400">
                        {searchedTopicSpace.name}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {sharedTopicSpaceError && (
                <p className="text-sm text-red-400">{sharedTopicSpaceError}</p>
              )}
            </div>
          )}

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
