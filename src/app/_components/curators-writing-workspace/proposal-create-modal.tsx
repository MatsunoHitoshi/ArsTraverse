import { useState } from "react";
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
  onSuccess: () => void;
}

export const ProposalCreateModal: React.FC<ProposalCreateModalProps> = ({
  isOpen,
  setIsOpen,
  topicSpaceId,
  graphDocument,
  onSuccess,
}) => {
  const [title, setTitle] = useState("グラフの変更提案");
  const [description, setDescription] = useState(
    "ワークスペースからグラフの変更を提案します",
  );

  const createProposal = api.graphEditProposal.createProposal.useMutation({
    onSuccess: () => {
      alert("変更提案を作成しました。管理者の承認をお待ちください。");
      setIsOpen(false);
      onSuccess();
      // フォームをリセット
      setTitle("グラフの変更提案");
      setDescription("ワークスペースからグラフの変更を提案します");
    },
    onError: (error) => {
      console.error("変更提案の作成に失敗しました", error);
      alert("変更提案の作成に失敗しました。");
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      alert("タイトルを入力してください");
      return;
    }

    if (!description.trim() || description.trim().length < 10) {
      alert("説明を10文字以上入力してください");
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
    // フォームをリセット
    setTitle("グラフの変更提案");
    setDescription("ワークスペースからグラフの変更を提案します");
  };

  return (
    <Modal isOpen={isOpen} setIsOpen={setIsOpen} title="変更提案を作成">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-white">
            タイトル <span className="text-red-400">*</span>
          </label>
          <TextInput
            value={title}
            onChange={setTitle}
            placeholder="変更提案のタイトルを入力"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-white">
            メッセージ <span className="text-red-400">*</span>
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="変更提案に関するメッセージを入力（10文字以上）"
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
            キャンセル
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
            {createProposal.isPending ? "作成中..." : "変更提案を作成"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
