import React, { useState } from "react";
import { Button } from "../button/button";
import { TextInput } from "../input/text-input";
import { Textarea } from "../textarea";
import { api } from "@/trpc/react";

interface ProposalCreateFormProps {
  topicSpaceId: string;
  newGraphData: {
    nodes: unknown[];
    relationships: unknown[];
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const ProposalCreateForm: React.FC<ProposalCreateFormProps> = ({
  topicSpaceId,
  newGraphData,
  onSuccess,
  onCancel,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createProposal = api.graphEditProposal.createProposal.useMutation({
    onSuccess: () => {
      setIsSubmitting(false);
      onSuccess?.();
    },
    onError: (error) => {
      console.error("提案作成エラー:", error);
      setIsSubmitting(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert("タイトルを入力してください");
      return;
    }

    if (!description.trim() || description.trim().length < 10) {
      alert("説明を10文字以上入力してください");
      return;
    }

    setIsSubmitting(true);

    try {
      await createProposal.mutateAsync({
        topicSpaceId,
        title: title.trim(),
        description: description.trim(),
        newGraphData: newGraphData,
      });
    } catch (error) {
      console.error("提案作成に失敗しました:", error);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">変更提案を作成</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="title" className="text-sm font-medium">
              タイトル <span className="text-red-500">*</span>
            </label>
            <TextInput
              id="title"
              value={title}
              onChange={(value) => setTitle(value)}
              placeholder="変更提案のタイトルを入力してください"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="text-sm font-medium">
              説明 <span className="text-red-500">*</span>
            </label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="変更内容の詳細説明を入力してください（10文字以上）"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onCancel} disabled={isSubmitting}>
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !title.trim() ||
                !description.trim() ||
                description.trim().length < 10
              }
            >
              {isSubmitting ? "作成中..." : "提案を作成"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
