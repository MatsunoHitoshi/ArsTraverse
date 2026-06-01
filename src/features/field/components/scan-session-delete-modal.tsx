"use client";

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
  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title="スキャンを削除">
      <p className="text-sm text-slate-300">
        「{sessionName}」を削除します。よろしいですか？
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
          キャンセル
        </Button>
        <Button
          onClick={onConfirm}
          isLoading={isPending}
          className="bg-red-700 text-white hover:bg-red-600"
        >
          削除する
        </Button>
      </div>
    </Modal>
  );
}
