import React from "react";
import { Modal } from "../modal/modal";
import { api } from "@/trpc/react";
import { Button } from "../button/button";

export type DeleteRecordType =
  | "sourceDocument"
  | "topicSpace"
  | "workspace"
  | "annotation";
type DeleteModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  type: DeleteRecordType;
  id: string;
  refetch: () => void;
};

export const DeleteRecordModal = ({
  isOpen,
  setIsOpen,
  type,
  id,
  refetch,
}: DeleteModalProps) => {
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // モーダルが開かれるたびにエラーメッセージをリセット
  React.useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
    }
  }, [isOpen]);

  const deleteDocument = api.sourceDocument.delete.useMutation();
  const deleteTopicSpace = api.topicSpaces.delete.useMutation();
  const deleteWorkspace = api.workspace.delete.useMutation();
  const deleteAnnotation = api.annotation.deleteAnnotation.useMutation();

  const title = () => {
    switch (type) {
      case "sourceDocument":
        return "ドキュメント";
      case "topicSpace":
        return "リポジトリ";
      case "workspace":
        return "ワークスペース";
      case "annotation":
        return "注釈";
    }
  };

  const submit = () => {
    switch (type) {
      case "sourceDocument":
        return deleteDocument.mutate(
          { id: id },
          {
            onSuccess: (_res) => {
              refetch();
              setIsOpen(false);
            },

            onError: (e) => {
              console.log(e);
              setErrorMessage(e.message || "削除に失敗しました");
            },
          },
        );
      case "topicSpace":
        return deleteTopicSpace.mutate(
          { id: id },
          {
            onSuccess: (_res) => {
              refetch();
              setIsOpen(false);
            },
            onError: (e) => {
              console.log(e);
              setErrorMessage(e.message || "削除に失敗しました");
            },
          },
        );
      case "workspace":
        return deleteWorkspace.mutate(
          { id: id },
          {
            onSuccess: (_res) => {
              refetch();
              setIsOpen(false);
            },
            onError: (e) => {
              console.log(e);
              setErrorMessage(e.message || "削除に失敗しました");
            },
          },
        );
      case "annotation":
        return deleteAnnotation.mutate(
          { annotationId: id },
          {
            onSuccess: (_res) => {
              refetch();
              setIsOpen(false);
            },
            onError: (e) => {
              console.log(e);
              setErrorMessage(e.message || "削除に失敗しました");
            },
          },
        );
    }
  };

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title={`${title()}を削除する`}>
      <div className="flex flex-col gap-6">
        <div>{`1件の${title()}を削除してもよろしいですか？`}</div>

        {errorMessage && (
          <div className="rounded-md bg-black/50  p-2 text-red-500">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm">{errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-row justify-end gap-2">
          <Button
            type="button"
            className="text-sm"
            onClick={() => setIsOpen(false)}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            className="text-sm text-error-red"
            onClick={() => submit()}
          >
            削除する
          </Button>
        </div>
      </div>
    </Modal>
  );
};
