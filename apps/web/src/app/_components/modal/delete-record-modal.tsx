import React from "react";
import { Modal } from "../modal/modal";
import { api } from "@/trpc/react";
import { Button } from "../button/button";

export type DeleteRecordType =
  | "sourceDocument"
  | "topicSpace"
  | "workspace"
  | "annotation"
  | "story"
  | "topicSpaceMember";
type DeleteModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  type: DeleteRecordType;
  id: string;
  /** topicSpaceMember のときに必要。id は userId として使用 */
  topicSpaceId?: string;
  refetch: () => void;
};

export const DeleteRecordModal = ({
  isOpen,
  setIsOpen,
  type,
  id,
  topicSpaceId,
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
  const deleteStory = api.story.delete.useMutation();
  const removeAdmin = api.topicSpaces.removeAdmin.useMutation();

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
      case "story":
        return "ストーリー";
      case "topicSpaceMember":
        return "メンバー";
    }
  };

  const isRemoveMember = type === "topicSpaceMember";

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
              window.history.back();
            },
            onError: (e) => {
              console.log(e);
              setErrorMessage(e.message || "削除に失敗しました");
            },
          },
        );
      case "story":
        return deleteStory.mutate(
          { workspaceId: id },
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
      case "topicSpaceMember":
        if (!topicSpaceId) return;
        return removeAdmin.mutate(
          { topicSpaceId, userId: id },
          {
            onSuccess: (_res) => {
              refetch();
              setIsOpen(false);
            },
            onError: (e) => {
              console.log(e);
              setErrorMessage(e.message || "メンバーを外すのに失敗しました");
            },
          },
        );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title={isRemoveMember ? "メンバーを外す" : `${title()}を削除する`}
    >
      <div className="flex flex-col gap-6">
        <div>
          {isRemoveMember
            ? "このメンバーをリポジトリから外しますか？"
            : `1件の${title()}を削除してもよろしいですか？`}
        </div>

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
            {isRemoveMember ? "外す" : "削除する"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
