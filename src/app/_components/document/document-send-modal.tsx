"use client";

import { Modal } from "../modal/modal";
import { Input } from "@headlessui/react";
import { useState, useCallback } from "react";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import clsx from "clsx";
import { useSession } from "next-auth/react";

type DocumentSendModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  documentId: string | null;
  documentName?: string;
  refetch: () => void;
};

export const DocumentSendModal = ({
  isOpen,
  setIsOpen,
  documentId,
  documentName,
  refetch,
}: DocumentSendModalProps) => {
  const { data: session } = useSession();
  const [queryInput, setQueryInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: searchResult, isFetching: isSearching } =
    api.user.searchByUserIdOrEmail.useQuery(
      { query: searchQuery },
      { enabled: !!searchQuery.trim() },
    );

  const recipient = searchResult?.[0] ?? null;
  const isSelf =
    !!session?.user?.id && !!recipient && recipient.id === session.user.id;

  const sendToUser = api.sourceDocument.sendToUser.useMutation({
    onSuccess: () => {
      refetch();
      setIsOpen(false);
      setQueryInput("");
      setSearchQuery("");
    },
    onError: (e) => {
      console.error(e);
    },
  });

  const handleSearch = useCallback(() => {
    const trimmed = queryInput.trim();
    if (trimmed) setSearchQuery(trimmed);
  }, [queryInput]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentId || !recipient || isSelf) return;
    sendToUser.mutate({
      documentId,
      recipientUserId: recipient.id,
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    setQueryInput("");
    setSearchQuery("");
  };

  if (!documentId) return null;

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="ユーザに送る"
      size="small"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
          {documentName && (
            <div className="text-sm text-slate-400">
              送信するドキュメント: {documentName}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold">
              送信先（ユーザIDまたはメールアドレス・完全一致）
            </div>
            <div className="flex flex-row gap-2">
              <Input
                type="text"
                placeholder="ユーザID または メールアドレス"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                className={clsx(
                  "block flex-1 rounded-lg border-none bg-white/5 px-3 py-1.5 text-sm/6",
                  "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
                )}
              />
              <Button
                type="button"
                theme="transparent"
                onClick={handleSearch}
                disabled={!queryInput.trim() || isSearching}
                className="text-sm"
              >
                {isSearching ? "検索中..." : "検索"}
              </Button>
            </div>
          </div>

          {searchQuery && !isSearching && (
            <div className="rounded-lg bg-white/5 px-3 py-2 text-sm">
              {recipient ? (
                <div className="flex flex-col gap-1">
                  <div>
                    {recipient.name ?? "(名前なし)"} / {recipient.email ?? recipient.id}
                  </div>
                  {isSelf && (
                    <div className="text-error-red">
                      自分自身には送信できません
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-400">ユーザが見つかりません</div>
              )}
            </div>
          )}

          <div className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              theme="transparent"
              onClick={handleClose}
              className="text-sm"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              className="text-sm"
              disabled={
                !recipient ||
                isSelf ||
                sendToUser.isPending
              }
            >
              {sendToUser.isPending ? "送信中..." : "送信"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
