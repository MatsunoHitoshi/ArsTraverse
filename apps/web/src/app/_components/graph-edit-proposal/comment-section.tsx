"use client";

import React, { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import { Textarea } from "../textarea";
import { formatRelativeTime } from "@/app/_utils/date/format-date";
import { ReplyIcon } from "@/app/_components/icons";
import Image from "next/image";

interface CommentSectionProps {
  proposalId: string;
}

export const CommentSection: React.FC<CommentSectionProps> = ({
  proposalId,
}) => {
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const {
    data: comments,
    isLoading,
    refetch,
  } = api.graphEditProposal.getComments.useQuery({
    proposalId,
  });

  const addComment = api.graphEditProposal.addComment.useMutation({
    onSuccess: () => {
      setNewComment("");
      void refetch();
    },
    onError: (error) => {
      console.error("コメント追加エラー:", error);
    },
  });

  const addReply = api.graphEditProposal.addComment.useMutation({
    onSuccess: () => {
      setReplyContent("");
      setReplyingTo(null);
      void refetch();
    },
    onError: (error) => {
      console.error("返信エラー:", error);
    },
  });

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim()) return;

    try {
      await addComment.mutateAsync({
        proposalId,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: newComment }],
            },
          ],
        },
      });
    } catch (error) {
      console.error("コメント送信エラー:", error);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!replyContent.trim() || !replyingTo) return;

    try {
      await addReply.mutateAsync({
        proposalId,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: replyContent }],
            },
          ],
        },
        parentCommentId: replyingTo,
      });
    } catch (error) {
      console.error("返信送信エラー:", error);
    }
  };

  const renderCommentContent = (content: unknown): string => {
    if (typeof content === "string") {
      return content;
    }

    if (content && typeof content === "object" && "content" in content) {
      const typedContent = content as { content: unknown[] };
      return typedContent.content
        .map((block: unknown) => {
          if (
            block &&
            typeof block === "object" &&
            "type" in block &&
            "content" in block &&
            block.type === "paragraph" &&
            Array.isArray(block.content)
          ) {
            return block.content
              .map((text: unknown) => {
                if (text && typeof text === "object" && "text" in text) {
                  return (text as { text: string }).text ?? "";
                }
                return "";
              })
              .join("");
          }
          return "";
        })
        .join("\n");
    }

    return "";
  };

  if (isLoading) {
    return <div className="text-gray-400">コメントを読み込み中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* コメント入力フォーム */}
      <form onSubmit={handleSubmitComment} className="space-y-3">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="コメントを入力してください..."
          rows={3}
          className="block w-full rounded-lg border border-gray-700 bg-slate-700 px-3 py-2 text-sm/6 text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={!newComment.trim()}>
            コメントを追加
          </Button>
        </div>
      </form>

      {/* コメント一覧 */}
      {comments && comments.length > 0 ? (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="border-l-2 border-gray-600 pl-4">
              <div className="rounded-lg border border-gray-700 bg-slate-800 p-4">
                <div className="mb-2 flex items-center gap-2">
                  {comment.author.image && (
                    <Image
                      src={comment.author.image}
                      alt={comment.author.name ?? ""}
                      className="h-6 w-6 rounded-full"
                      height={24}
                      width={24}
                    />
                  )}
                  <span className="text-sm font-medium text-gray-300">
                    {comment.author.name ?? "不明"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatRelativeTime(new Date(comment.createdAt))}
                  </span>
                </div>

                <p className="whitespace-pre-wrap text-gray-400">
                  {renderCommentContent(comment.content)}
                </p>

                <div className="mt-3 flex w-full flex-row justify-end">
                  <Button
                    size="small"
                    onClick={() => setReplyingTo(comment.id)}
                    className="flex flex-row items-center justify-center gap-1 hover:bg-slate-600"
                  >
                    <ReplyIcon height={16} width={16} color="white" />
                    返信
                  </Button>
                </div>
              </div>

              {/* 返信フォーム */}
              {replyingTo === comment.id && (
                <div className="ml-4 mt-3">
                  <form onSubmit={handleSubmitReply} className="space-y-2">
                    <Textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="返信を入力してください..."
                      rows={2}
                      className="block w-full rounded-lg border border-gray-700 bg-slate-700 px-3 py-2 text-sm/6 text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="small"
                        disabled={!replyContent.trim()}
                      >
                        返信
                      </Button>
                      <Button
                        type="button"
                        size="small"
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyContent("");
                        }}
                        className="bg-slate-600 hover:bg-slate-700"
                      >
                        キャンセル
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {/* 子コメント */}
              {comment.childComments && comment.childComments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {comment.childComments.map((reply) => (
                    <div
                      key={reply.id}
                      className="ml-4 border-l-2 border-gray-600 pl-4"
                    >
                      <div className="rounded-lg border border-gray-700 bg-slate-800 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          {reply.author.image && (
                            <Image
                              src={reply.author.image}
                              alt={reply.author.name ?? ""}
                              className="rounded-full"
                              height={20}
                              width={20}
                            />
                          )}
                          <span className="text-sm font-medium text-gray-300">
                            {reply.author.name ?? "不明"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatRelativeTime(new Date(reply.createdAt))}
                          </span>
                        </div>

                        <p className="whitespace-pre-wrap text-sm text-gray-400">
                          {renderCommentContent(reply.content)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-gray-400">
          コメントがありません
        </div>
      )}
    </div>
  );
};
