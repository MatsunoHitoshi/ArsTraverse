"use client";

import React, { useState } from "react";
import { Button } from "../button/button";
import { TextInput } from "../input/text-input";
import { Textarea } from "../textarea";
import { api } from "@/trpc/react";
import { GraphChangeType, GraphChangeEntityType } from "@prisma/client";
// import type { CustomNodeType, CustomLinkType } from "@/app/const/types";
import { DiffViewer } from "@/app/_components/graph-edit-proposal/diff-viewer";

interface ProposalCreateFormProps {
  topicSpaceId: string;
  changes: {
    changeType: GraphChangeType;
    changeEntityType: GraphChangeEntityType;
    changeEntityId: string;
    previousState: { nodes: unknown[]; relationships: unknown[] };
    nextState: { nodes: unknown[]; relationships: unknown[] };
  }[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const ProposalCreateForm: React.FC<ProposalCreateFormProps> = ({
  topicSpaceId,
  changes,
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

    if (changes.length === 0) {
      alert("変更内容がありません");
      return;
    }

    setIsSubmitting(true);

    try {
      await createProposal.mutateAsync({
        topicSpaceId,
        title: title.trim(),
        description: description.trim() || undefined,
        changes,
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
              説明
            </label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="変更内容の詳細説明を入力してください（任意）"
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">変更内容</label>
            <div className="rounded-lg border bg-gray-50 p-4">
              <DiffViewer changes={changes} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onCancel} disabled={isSubmitting}>
              キャンセル
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? "作成中..." : "提案を作成"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
