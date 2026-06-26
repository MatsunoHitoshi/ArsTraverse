"use client";

import { useTranslations } from "next-intl";
import { Modal } from "@/app/_components/modal/modal";
import { Button } from "@/app/_components/button/button";

type ScanSessionDeleteModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sessionName?: string;
  errorMessage?: string | null;
  isPending?: boolean;
  onConfirm: () => void;
};

export function ScanSessionDeleteModal({
  isOpen,
  setIsOpen,
  sessionName,
  errorMessage,
  isPending = false,
  onConfirm,
}: ScanSessionDeleteModalProps) {
  const t = useTranslations("field");
  const tCommon = useTranslations("common");

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={t("deleteScanTitle")}>
      <p className="text-sm text-slate-300">
        {t("deleteScanConfirm", { name: sessionName ?? "" })}
      </p>
      {errorMessage && (
        <p className="mt-3 text-sm text-red-300">{errorMessage}</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button
          onClick={() => setIsOpen(false)}
          className="bg-slate-700 text-white"
          disabled={isPending}
        >
          {tCommon("cancel")}
        </Button>
        <Button
          onClick={onConfirm}
          isLoading={isPending}
          className="bg-red-700 text-white hover:bg-red-600"
        >
          {t("confirmDelete")}
        </Button>
      </div>
    </Modal>
  );
}
