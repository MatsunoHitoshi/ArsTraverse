import { useState } from "react";
import { api } from "@/trpc/react";
import { storageUtils } from "@/app/_utils/supabase/supabase";
import { BUCKETS } from "@/app/_utils/supabase/const";
import {
  GraphDocumentForFrontend,
  CreateSourceDocumentResponse,
} from "@/app/const/types";
import { TopicSpace } from "@prisma/client";

export type ProcessingStep = "upload" | "extract" | "graph" | "complete";

export const usePDFProcessing = (
  workspaceId: string,
  onSuccess?: () => void,
) => {
  const [isProcessingPDF, setIsProcessingPDF] = useState(false);
  const [processingStep, setProcessingStep] =
    useState<ProcessingStep>("upload");
  const [processingError, setProcessingError] = useState<string | null>(null);

  // PDF処理用のAPI呼び出し
  const extractKG = api.kg.extractKG.useMutation();
  const createSourceDocument =
    api.sourceDocument.createWithGraphData.useMutation();
  const createTopicSpace = api.topicSpaces.create.useMutation();
  const updateWorkspace = api.workspace.update.useMutation();

  const handlePDFUpload = async (file: File) => {
    try {
      setIsProcessingPDF(true);
      setProcessingError(null);
      setProcessingStep("upload");

      // ファイル形式チェック
      if (file.type !== "application/pdf") {
        throw new Error("PDFファイルのみアップロード可能です");
      }

      // ファイルサイズチェック（50MB）
      if (file.size > 50 * 1024 * 1024) {
        throw new Error("ファイルサイズは50MB以下にしてください");
      }

      // ファイルをBase64に変換してアップロード
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result?.toString();
          if (!base64Data) {
            throw new Error("ファイルの読み込みに失敗しました");
          }

          // Supabase Storageにアップロード
          const fileUrl = await storageUtils.uploadFromDataURL(
            base64Data,
            BUCKETS.PATH_TO_INPUT_PDF,
          );

          if (!fileUrl) {
            throw new Error("ファイルのアップロードに失敗しました");
          }

          // グラフ抽出
          setProcessingStep("extract");
          await processPDFToGraph(fileUrl, file.name);
        } catch (error) {
          console.error("PDF処理エラー:", error);
          setProcessingError(
            error instanceof Error
              ? error.message
              : "PDF処理中にエラーが発生しました",
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
          : "アップロード中にエラーが発生しました",
      );
      setIsProcessingPDF(false);
    }
  };

  const processPDFToGraph = async (fileUrl: string, fileName: string) => {
    try {
      setProcessingStep("graph");

      // グラフ抽出
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
        throw new Error("グラフの抽出に失敗しました");
      }

      const graphData = extractResult.data.graph;

      // SourceDocumentとDocumentGraphを作成
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
        throw new Error("ドキュメントの作成に失敗しました");
      }

      console.log("DocumentResult:", documentResult);
      // createWithGraphDataは{ documentGraph, sourceDocument }を返す
      const sourceDocumentId = documentResult.sourceDocument.id;
      console.log("SourceDocumentId:", sourceDocumentId);

      // TopicSpaceを作成
      const topicSpaceResult = await new Promise<TopicSpace>(
        (resolve, reject) => {
          createTopicSpace.mutate(
            {
              name: fileName.replace(".pdf", ""),
              description: `ワークスペースか作成されたリポジトリ: ${fileName}`,
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
        throw new Error("リポジトリの作成に失敗しました");
      }

      // ワークスペースにリポジトリをアタッチ
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

      setProcessingStep("complete");
      setIsProcessingPDF(false);

      // 成功時のコールバックを実行
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("グラフ処理エラー:", error);
      setProcessingError(
        error instanceof Error
          ? error.message
          : "グラフ処理中にエラーが発生しました",
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
