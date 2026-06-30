"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "../modal/modal";
import { Button } from "../button/button";
import { TextInput } from "../input/text-input";
import { Textarea } from "../textarea";
import { api } from "@/trpc/react";
import type { GraphDocumentForFrontend } from "@/app/const/types";

interface ProposalCreateModalProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  topicSpaceId: string;
  graphDocument: GraphDocumentForFrontend;
  onSuccess: (proposalId: string) => void;
}

export const ProposalCreateModal: React.FC<ProposalCreateModalProps> = ({
  isOpen,
  setIsOpen,
  topicSpaceId,
  graphDocument,
  onSuccess,
}) => {
  const t = useTranslations("workspace");
  const tCommon = useTranslations("common");
  const defaults = useMemo(
    () => ({
      title: t("proposalDefaultTitle"),
      description: t("proposalDefaultDescription"),
    }),
    [t],
  );
  const [title, setTitle] = useState(defaults.title);
  const [description, setDescription] = useState(defaults.description);

  const createProposal = api.graphEditProposal.createProposal.useMutation({
    onSuccess: (response) => {
      onSuccess(response.id);
    },
    onError: (error) => {
      console.error("変更提案の作成に失敗しました", error);
      alert(t("proposalCreateFailed"));
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      alert(t("proposalTitleRequired"));
      return;
    }

    if (!description.trim() || description.trim().length < 10) {
      alert(t("proposalDescriptionMinLength"));
      return;
    }

    createProposal.mutate({
      topicSpaceId,
      title: title.trim(),
      description: description.trim(),
      newGraphData: graphDocument,
    });
  };

  const handleCancel = () => {
    setIsOpen(false);
    setTitle(defaults.title);
    setDescription(defaults.description);
  };

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={t("createProposalTitle")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-white">
            {t("proposalTitleLabel")} <span className="text-red-400">*</span>
          </label>
          <TextInput
            value={title}
            onChange={setTitle}
            placeholder={t("proposalTitlePlaceholder")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-white">
            {t("proposalMessageLabel")} <span className="text-red-400">*</span>
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("proposalMessagePlaceholder")}
            className="block w-full rounded-lg border-none bg-white/5 px-3 py-2 text-sm/6 text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>

        <div className="flex flex-row justify-end gap-2">
          <Button
            type="button"
            onClick={handleCancel}
            className="bg-slate-600 hover:bg-slate-700"
            disabled={createProposal.isPending}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              createProposal.isPending ||
              !title.trim() ||
              !description.trim() ||
              description.trim().length < 10
            }
          >
            {createProposal.isPending
              ? tCommon("creating")
              : t("createProposalAction")}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
