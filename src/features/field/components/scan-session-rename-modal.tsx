"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Modal } from "@/app/_components/modal/modal";
import { Button } from "@/app/_components/button/button";
import { TextInput } from "@/app/_components/input/text-input";

type ScanSessionRenameModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sessionId: string | null;
  initialName?: string;
  onSuccess?: () => void;
};

export function ScanSessionRenameModal({
  isOpen,
  setIsOpen,
  sessionId,
  initialName = "",
  onSuccess,
}: ScanSessionRenameModalProps) {
  const t = useTranslations("field");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(initialName);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setErrorMessage(null);
    }
  }, [initialName, isOpen]);

  const renameSession = api.scan.renameSession.useMutation({
    onSuccess: () => {
      setIsOpen(false);
      onSuccess?.();
    },
    onError: (error) => {
      setErrorMessage(error.message ?? t("renameFailed"));
    },
  });

  if (!sessionId) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={t("renameScanTitle")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-sm text-slate-200">{t("name")}</div>
          <TextInput
            value={name}
            onChange={setName}
            placeholder={t("scanNamePlaceholder")}
          />
        </div>
        {errorMessage && (
          <p className="text-sm text-red-300">{errorMessage}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            className="!text-small !p-1 text-slate-400"
            onClick={() => setIsOpen(false)}
            disabled={renameSession.isPending}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            className="!text-small !p-1"
            onClick={() => {
              if (!name.trim()) {
                setErrorMessage(t("nameRequired"));
                return;
              }
              renameSession.mutate({ id: sessionId, name: name.trim() });
            }}
            isLoading={renameSession.isPending}
            disabled={!name.trim()}
          >
            {tCommon("save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
