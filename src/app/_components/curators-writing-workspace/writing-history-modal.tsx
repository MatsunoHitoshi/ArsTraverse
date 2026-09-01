"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "../button/button";
import { formatDate } from "@/app/_utils/date/format-date";
import type { Locale } from "i18n/routing";
import { useLocale } from "next-intl";

interface WritingHistoryModalProps {
  workspaceId: string;
  onClose: () => void;
  onRestored: (content: unknown) => void;
}

export const WritingHistoryModal: React.FC<WritingHistoryModalProps> = ({
  workspaceId,
  onClose,
  onRestored,
}) => {
  const t = useTranslations("workspace");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const { data: histories, isLoading, refetch } =
    api.workspace.getWritingHistory.useQuery({ workspaceId });
  const restore = api.workspace.restoreWritingHistory.useMutation({
    onSuccess: (data) => {
      void refetch();
      onRestored(data.content);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-semibold">{t("writingHistoryTitle")}</h3>
          <Button onClick={onClose} className="bg-gray-200 text-gray-800">
            ×
          </Button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-gray-500">{tCommon("loading")}</div>
        ) : histories && histories.length > 0 ? (
          <div className="space-y-3">
            {histories.map((history) => (
              <div
                key={history.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  <span>{formatDate(history.createdAt, locale)}</span>
                  {history.changedBy.name && (
                    <span className="text-gray-500">{history.changedBy.name}</span>
                  )}
                </div>
                {history.changeDescription && (
                  <p className="mb-2 text-sm text-gray-700">
                    {history.changeDescription}
                  </p>
                )}
                <p className="mb-3 text-xs leading-relaxed text-gray-500">
                  {history.preview || "—"}
                </p>
                <Button
                  onClick={() =>
                    restore.mutate({
                      workspaceId,
                      historyId: history.id,
                    })
                  }
                  disabled={restore.isPending}
                  className="bg-gray-800 text-white"
                >
                  {restore.isPending
                    ? t("writingHistoryRestoring")
                    : t("writingHistoryRestore")}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">
            {t("writingHistoryEmpty")}
          </div>
        )}
      </div>
    </div>
  );
};
