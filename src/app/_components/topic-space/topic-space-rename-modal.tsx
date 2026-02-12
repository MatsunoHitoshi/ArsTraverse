"use client";

import { Modal } from "../modal/modal";
import { Input } from "@headlessui/react";
import { useState, useEffect } from "react";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import clsx from "clsx";
import type { TopicSpaceResponse } from "@/app/const/types";

type TopicSpaceRenameModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  topicSpace: TopicSpaceResponse | null;
  onSuccess?: () => void;
};

export const TopicSpaceRenameModal = ({
  isOpen,
  setIsOpen,
  topicSpace,
  onSuccess,
}: TopicSpaceRenameModalProps) => {
  const [name, setName] = useState("");

  useEffect(() => {
    if (topicSpace && isOpen) {
      setName(topicSpace.name);
    }
  }, [topicSpace, isOpen]);

  const updateTopicSpace = api.topicSpaces.update.useMutation({
    onSuccess: () => {
      onSuccess?.();
      setIsOpen(false);
    },
    onError: (e) => {
      console.error(e);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicSpace || !name.trim()) return;
    updateTopicSpace.mutate({ id: topicSpace.id, name: name.trim() });
  };

  if (!topicSpace) return null;

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="リポジトリの名称を変更"
      size="small"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold">名前</div>
            <Input
              type="text"
              placeholder="名前を入力"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={clsx(
                "block w-full rounded-lg border-none bg-white/5 px-3 py-1.5 text-sm/6",
                "focus:outline-none data-[focus]:outline-1 data-[focus]:-outline-offset-2 data-[focus]:outline-slate-400",
              )}
              autoFocus
            />
          </div>
          <div className="flex flex-row justify-end gap-2">
            <Button
              type="button"
              theme="transparent"
              onClick={() => setIsOpen(false)}
              className="text-sm"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              className="text-sm"
              disabled={!name.trim() || updateTopicSpace.isPending}
            >
              {updateTopicSpace.isPending ? "変更中..." : "変更する"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
