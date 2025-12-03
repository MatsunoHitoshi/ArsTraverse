"use client";

import { api } from "@/trpc/react";
import Image from "next/image";
import { Input } from "@headlessui/react";
import { NodeLinkChangeHistory } from "./node-link-change-history";
import { useState } from "react";
import { Button } from "../button/button";
import { Textarea } from "../textarea";
import { ResetIcon, ChevronRightIcon, ReloadIcon } from "../icons";
import { formatRelativeTime } from "@/app/_utils/date/format-date";

export const TopicSpaceChangeHistory = ({
  topicSpaceId,
}: {
  topicSpaceId: string;
}) => {
  const { data: changeHistories, refetch } =
    api.topicSpaceChangeHistory.listByTopicSpaceId.useQuery({
      id: topicSpaceId,
    });

  const [detailHistoryId, setDetailHistoryId] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState<string | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");

  const filteredChangeHistories = changeHistories?.filter((history) => {
    if (!searchTerm) return true;
    return history.description
      ?.toLowerCase()
      .includes(searchTerm.toLowerCase());
  });

  const rollbackChange = api.graphEditProposal.rollbackChange.useMutation({
    onSuccess: () => {
      setIsRollingBack(null);
      setRollbackReason("");
      setSelectedHistoryId(null);
      void refetch();
    },
    onError: (error) => {
      console.error("ロールバックエラー:", error);
      setIsRollingBack(null);
    },
  });

  const handleRollback = async (historyId: string) => {
    setIsRollingBack(historyId);

    try {
      await rollbackChange.mutateAsync({
        changeHistoryId: historyId,
        reason: rollbackReason || undefined,
      });
    } catch (error) {
      console.error("ロールバック実行エラー:", error);
    }
  };

  if (!changeHistories) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">変更履歴</div>
        <div className="flex items-center gap-2">
          <Input
            className="block w-48 rounded-lg border border-gray-700 bg-slate-700 px-3 py-1.5 text-sm/6 text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            placeholder="履歴を検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button size="small" onClick={() => refetch()}>
            <ReloadIcon height={16} width={16} color="white" />
          </Button>
        </div>
      </div>

      {filteredChangeHistories?.length === 0 ? (
        <div className="py-8 text-center text-gray-500">
          {searchTerm
            ? "検索条件に一致する履歴がありません"
            : "変更履歴がありません"}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredChangeHistories?.map((history) => (
            <div key={history.id} className="rounded-lg border p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <Button
                        size="small"
                        className="flex items-center gap-1"
                        onClick={() =>
                          detailHistoryId === history.id
                            ? setDetailHistoryId(null)
                            : setDetailHistoryId(history.id)
                        }
                      >
                        <span
                          className={`transform transition-transform ${
                            detailHistoryId === history.id
                              ? "rotate-90"
                              : "rotate-0"
                          }`}
                        >
                          <ChevronRightIcon
                            height={16}
                            width={16}
                            color="white"
                          />
                        </span>
                      </Button>
                      <div className="flex flex-col">
                        <div className="mb-2 flex items-center gap-2">
                          <div className="text-sm">
                            {history.description ?? "変更"}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-2">
                            {history.user.image && (
                              <Image
                                src={history.user.image}
                                alt={history.user.name ?? ""}
                                className="rounded-full"
                                height={20}
                                width={20}
                              />
                            )}
                            <span>{history.user.name ?? "不明"}</span>
                          </div>
                          <span>
                            {formatRelativeTime(new Date(history.createdAt))}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      size="small"
                      className="flex flex-row items-center gap-1"
                      onClick={() => setSelectedHistoryId(history.id)}
                      disabled={isRollingBack === history.id}
                    >
                      <ResetIcon height={16} width={16} color="white" />
                      {isRollingBack === history.id
                        ? "ロールバック中..."
                        : "ロールバック"}
                    </Button>
                  </div>

                  {/* ロールバック確認ダイアログ */}
                  {selectedHistoryId === history.id && (
                    <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                      <h4 className="mb-2 font-medium text-yellow-800">
                        ロールバックの確認
                      </h4>
                      <p className="mb-3 text-sm text-yellow-700">
                        この変更をロールバックしますか？この操作は元に戻すことができません。
                      </p>

                      <div className="space-y-3">
                        <Textarea
                          value={rollbackReason}
                          onChange={(e) => setRollbackReason(e.target.value)}
                          placeholder="ロールバック理由を入力してください（任意）"
                          rows={2}
                          className="block w-full rounded-lg border border-gray-700 bg-slate-700 px-3 py-2 text-sm/6 text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />

                        <div className="flex gap-2">
                          <Button
                            size="small"
                            onClick={() => handleRollback(history.id)}
                            disabled={isRollingBack === history.id}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {isRollingBack === history.id
                              ? "ロールバック中..."
                              : "ロールバック実行"}
                          </Button>
                          <Button
                            size="small"
                            onClick={() => {
                              setSelectedHistoryId(null);
                              setRollbackReason("");
                            }}
                            disabled={isRollingBack === history.id}
                          >
                            キャンセル
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 変更内容の詳細表示 */}
                  {detailHistoryId === history.id && (
                    <NodeLinkChangeHistory graphChangeHistoryId={history.id} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
