"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { BUCKETS } from "@/app/_utils/supabase/const";
import type {
  GraphDocumentForFrontend,
  CreateSourceDocumentResponse,
} from "@/app/const/types";
import type { TopicSpace } from "@prisma/client";

export type ProcessingStep = "upload" | "extract" | "graph" | "complete";

export const usePDFProcessing = (
  workspaceId: string,
  onSuccess?: () => void,
  existingTopicSpaceId?: string | null,
  onComplete?: () => void,
) => {
  const t = useTranslations("workspace");
  const [isProcessingPDF, setIsProcessingPDF] = useState(false);
  const [processingStep, setProcessingStep] =
    useState<ProcessingStep>("upload");
  const [processingError, setProcessingError] = useState<string | null>(null);

  const extractKG = api.kg.extractKG.useMutation();
  const createSourceDocument =
    api.sourceDocument.createWithGraphData.useMutation();
  const createTopicSpace = api.topicSpaces.create.useMutation();
  const updateWorkspace = api.workspace.update.useMutation();
  const attachDocuments = api.topicSpaces.attachDocuments.useMutation();

  const handlePDFUpload = async (file: File) => {
    try {
      setIsProcessingPDF(true);
      setProcessingError(null);
      setProcessingStep("upload");

      if (file.type !== "application/pdf") {
        throw new Error(t("pdfOnly"));
      }

      if (file.size > 50 * 1024 * 1024) {
        throw new Error(t("pdfSizeExceeded"));
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result?.toString();
          if (!base64Data) {
            throw new Error(t("fileReadFailed"));
          }

          const fileUrl = await storageUtils.uploadFromDataURL(
            base64Data,
            BUCKETS.PATH_TO_INPUT_PDF,
          );

          if (!fileUrl) {
            throw new Error(t("fileUploadFailed"));
          }

          setProcessingStep("extract");
          await processPDFToGraph(fileUrl, file.name);
        } catch (error) {
          console.error("PDF処理エラー:", error);
          setProcessingError(
            error instanceof Error
              ? error.message
              : t("pdfProcessingError"),
          );
          setIsProcessingPDF(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("PDFアップロードエラー:", error);
      setProcessingError(
        error instanceof Error
          ? error.message
          : t("uploadProcessingError"),
      );
      setIsProcessingPDF(false);
    }
  };

  const processPDFToGraph = async (fileUrl: string, fileName: string) => {
    try {
      setProcessingStep("graph");

      const extractResult = await new Promise<{
        data: { graph: GraphDocumentForFrontend | null; error?: string };
      }>((resolve, reject) => {
        extractKG.mutate(
          {
            fileUrl: fileUrl,
            extractMode: "langChain",
            isPlaneTextMode: false,
          },
          {
            onSuccess: (res) => {
              resolve(res);
            },
            onError: (error) => {
              reject(error);
            },
          },
        );
      });

      if (!extractResult?.data?.graph) {
        throw new Error(t("graphExtractFailedPdf"));
      }

      const graphData = extractResult.data.graph;

      const documentResult = await new Promise<CreateSourceDocumentResponse>(
        (resolve, reject) => {
          createSourceDocument.mutate(
            {
              name: fileName,
              url: fileUrl,
              dataJson: graphData,
            },
            {
              onSuccess: (res) => {
                console.log("SourceDocument作成成功:", res);
                resolve(res);
              },
              onError: (error) => {
                console.error("SourceDocument作成エラー:", error);
                reject(error);
              },
            },
          );
        },
      );

      if (!documentResult) {
        throw new Error(t("documentCreateFailed"));
      }

      const sourceDocumentId = documentResult.sourceDocument.id;

      if (existingTopicSpaceId) {
        await new Promise((resolve, reject) => {
          attachDocuments.mutate(
            {
              id: existingTopicSpaceId,
              documentIds: [sourceDocumentId],
            },
            {
              onSuccess: () => {
                console.log("既存のTopicSpaceにドキュメントをアタッチ成功");
                resolve(true);
              },
              onError: (error) => {
                console.error("既存のTopicSpaceへのアタッチエラー:", error);
                reject(error);
              },
            },
          );
        });
      } else {
        const topicSpaceResult = await new Promise<TopicSpace>(
          (resolve, reject) => {
            createTopicSpace.mutate(
              {
                name: fileName.replace(".pdf", ""),
                description: t("topicSpaceFromWorkspace", { fileName }),
                documentId: sourceDocumentId,
              },
              {
                onSuccess: (res) => {
                  console.log("TopicSpace作成成功:", res);
                  resolve(res);
                },
                onError: (error) => {
                  console.error("TopicSpace作成エラー:", error);
                  reject(error);
                },
              },
            );
          },
        );

        if (!topicSpaceResult) {
          throw new Error(t("topicSpaceCreateFailed"));
        }

        const currentTopicSpaceIds: string[] = [];
        await new Promise((resolve, reject) => {
          updateWorkspace.mutate(
            {
              id: workspaceId,
              referencedTopicSpaceIds: [
                ...currentTopicSpaceIds,
                topicSpaceResult.id,
              ],
            },
            {
              onSuccess: () => {
                resolve(true);
              },
              onError: (error) => {
                reject(error);
              },
            },
          );
        });
      }

      setProcessingStep("complete");
      setIsProcessingPDF(false);

      if (onSuccess) {
        onSuccess();
      }

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error("グラフ処理エラー:", error);
      setProcessingError(
        error instanceof Error
          ? error.message
          : t("graphProcessingError"),
      );
      setIsProcessingPDF(false);
    }
  };

  return {
    isProcessingPDF,
    processingStep,
    processingError,
    handlePDFUpload,
  };
};
