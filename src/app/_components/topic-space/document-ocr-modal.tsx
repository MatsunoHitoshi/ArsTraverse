"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DocumentType } from "@prisma/client";
import type { DocumentResponse } from "@/app/const/types";
import { api } from "@/trpc/react";
import { Modal } from "../modal/modal";
import { Button } from "../button/button";

type OcrLanguageOption = "auto" | "jpn" | "jpn_vert" | "eng";

type DocumentOcrModalProps = {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  topicSpaceId: string;
  document: DocumentResponse | null;
  onCompleted?: () => void;
};

export function isOcrEligibleDocument(document: DocumentResponse): boolean {
  return (
    document.documentType === DocumentType.INPUT_PDF ||
    document.documentType === DocumentType.INPUT_DRIVE
  );
}

function jobNeedsMoreBatches(job: {
  status: string;
  pageCount: number | null;
  processedPages: number;
}) {
  if (job.status !== "PENDING" && job.status !== "PROCESSING") {
    return false;
  }
  if (job.pageCount == null) return job.status === "PENDING";
  return job.processedPages < job.pageCount;
}

export function DocumentOcrModal({
  isOpen,
  setIsOpen,
  topicSpaceId,
  document,
  onCompleted,
}: DocumentOcrModalProps) {
  const t = useTranslations("topicSpace");
  const tCommon = useTranslations("common");
  const documentId = document?.id ?? null;
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguageOption>("auto");
  const advancingRef = useRef(false);
  const completedRef = useRef(false);

  const statusQuery = api.topicSpaces.getDocumentOcrStatus.useQuery(
    {
      topicSpaceId,
      documentId: documentId ?? "",
    },
    {
      enabled: isOpen && !!documentId,
      refetchInterval: (query) => {
        const job = query.state.data?.job;
        if (!job) return false;
        return jobNeedsMoreBatches(job) ? 2000 : false;
      },
    },
  );

  const startOcr = api.topicSpaces.startDocumentOcr.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });
  const advanceOcr = api.topicSpaces.advanceDocumentOcr.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });

  useEffect(() => {
    if (isOpen) {
      setOcrLanguage("auto");
      completedRef.current = false;
    }
  }, [isOpen, documentId]);

  const job = statusQuery.data?.job;
  const isRunning =
    startOcr.isPending ||
    advanceOcr.isPending ||
    (job != null && jobNeedsMoreBatches(job));

  useEffect(() => {
    if (!isOpen || !documentId || !job) return;
    if (!jobNeedsMoreBatches(job)) {
      if (job.status === "COMPLETED" && !completedRef.current) {
        completedRef.current = true;
        onCompleted?.();
      }
      return;
    }
    if (job.status !== "PENDING") return;
    if (advancingRef.current || advanceOcr.isPending || startOcr.isPending) {
      return;
    }

    advancingRef.current = true;
    advanceOcr.mutate(
      { topicSpaceId, documentId },
      {
        onSettled: () => {
          advancingRef.current = false;
        },
      },
    );
  }, [
    advanceOcr,
    documentId,
    isOpen,
    job,
    onCompleted,
    startOcr.isPending,
    topicSpaceId,
  ]);

  const handleStart = () => {
    if (!documentId) return;
    startOcr.mutate({
      topicSpaceId,
      documentId,
      ocrLanguage,
    });
  };

  if (!documentId || !document) {
    return null;
  }

  const textPreview = statusQuery.data?.textPreview;
  const errorMessage = startOcr.error?.message ?? advanceOcr.error?.message;

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title={t("ocrModalTitle")}
      size="large"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-300">{t("ocrModalDescription")}</p>
        <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3 text-sm">
          <div className="font-semibold text-slate-100">{document.name}</div>
        </div>

        {textPreview && (
          <div className="flex flex-col gap-1">
            <div className="text-xs text-slate-400">{t("ocrTextPreview")}</div>
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">
              {textPreview}
              {textPreview.length >= 500 ? "…" : ""}
            </pre>
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span>{t("ocrLanguageLabel")}</span>
          <select
            value={ocrLanguage}
            onChange={(event) =>
              setOcrLanguage(event.target.value as OcrLanguageOption)
            }
            disabled={isRunning}
            className="rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-slate-100"
          >
            <option value="auto">{t("ocrLanguageAuto")}</option>
            <option value="jpn">{t("ocrLanguageJpn")}</option>
            <option value="jpn_vert">{t("ocrLanguageJpnVert")}</option>
            <option value="eng">{t("ocrLanguageEng")}</option>
          </select>
          <span className="text-xs text-slate-500">{t("ocrLanguageHint")}</span>
        </label>

        {job && (
          <div className="rounded-md border border-slate-700/80 bg-slate-900/40 p-3 text-xs text-slate-300">
            <div>
              {t("ocrJobStatus", {
                status: job.status,
                processed: job.processedPages,
                total: job.pageCount ?? "?",
              })}
            </div>
            {job.detectedLanguage && (
              <div>
                {t("ocrDetectedLanguage", { language: job.detectedLanguage })}
              </div>
            )}
            {job.error && (
              <div className="mt-1 text-red-400">{job.error}</div>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="text-xs text-red-400">{errorMessage}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            className="!text-small !p-2 text-slate-400"
            onClick={() => setIsOpen(false)}
            disabled={isRunning}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            className="!text-small !p-2"
            onClick={handleStart}
            disabled={isRunning}
          >
            {isRunning ? t("ocrRunning") : t("ocrStart")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
