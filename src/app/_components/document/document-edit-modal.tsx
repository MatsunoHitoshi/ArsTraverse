"use client";

import { Modal } from "../modal/modal";
import { TextInput } from "../input/text-input";
import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import { useTranslations } from "next-intl";

export const DocumentEditModal = ({
  isOpen,
  setIsOpen,
  documentId,
  refetch,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  documentId: string | null;
  refetch: () => void;
}) => {
  const t = useTranslations("document");
  const tCommon = useTranslations("common");
  const { data: document } = api.sourceDocument.getById.useQuery(
    { id: documentId! },
    { enabled: isOpen && !!documentId },
  );

  const { mutate: updateDocument } = api.sourceDocument.update.useMutation();

  const [name, setName] = useState<string>();

  useEffect(() => {
    if (document) {
      setName(document.name);
    }
  }, [document]);

  const onSubmit = () => {
    if (!!documentId) {
      updateDocument(
        { id: documentId, name: name ?? "" },
        {
          onSuccess: () => {
            setIsOpen(false);
            refetch();
          },
          onError: (error) => {
            console.error(error);
          },
        },
      );
    }
  };

  if (!documentId) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={t("editDocumentTitle")}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <div>{t("name")}</div>

          <TextInput
            onChange={setName}
            value={name}
            placeholder={t("documentNamePlaceholder")}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            className="!text-small !p-1 text-slate-400"
            onClick={() => setIsOpen(false)}
          >
            {tCommon("cancel")}
          </Button>
          <Button className="!text-small !p-1" onClick={onSubmit}>
            {tCommon("save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
