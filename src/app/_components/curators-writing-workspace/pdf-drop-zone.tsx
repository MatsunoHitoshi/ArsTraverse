"use client";

import React from "react";
import { DropFileProviderDashed } from "../drop-file/drop-file-provider";
import { Button } from "../button/button";
import type { ProcessingStep } from "./hooks/use-pdf-processing";

interface PDFDropZoneProps {
  isProcessingPDF: boolean;
  processingStep: ProcessingStep;
  processingError: string | null;
  onPDFUpload: (file: File) => void;
  onSelectExistingRepository: () => void;
  withTopicSpaceOption?: boolean;
}

export const PDFDropZone: React.FC<PDFDropZoneProps> = ({
  isProcessingPDF,
  processingStep,
  processingError,
  onPDFUpload,
  onSelectExistingRepository,
  withTopicSpaceOption = false,
}) => {
  const handleFileSet = (
    file: File | null | ((prev: File | null) => File | null),
  ) => {
    const resolvedFile = typeof file === "function" ? file(null) : file;
    if (resolvedFile) {
      onPDFUpload(resolvedFile);
    }
  };

  return (
    <DropFileProviderDashed setFile={handleFileSet}>
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8">
        {isProcessingPDF ? (
          <div className="text-center">
            <div className="mb-4">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
            </div>
            <p className="mb-2 text-lg text-gray-300">
              {processingStep === "upload" && "ファイルをアップロード中..."}
              {processingStep === "extract" && "テキストを抽出中..."}
              {processingStep === "graph" && "知識グラフを生成中..."}
              {processingStep === "complete" && "完了しました！"}
            </p>
            {processingError && (
              <p className="text-sm text-red-400">エラー: {processingError}</p>
            )}
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="mb-2 text-lg text-white">
                PDFをドラッグアンドドロップ
              </p>
              <p className="text-center text-xs text-gray-300">（50MB以下）</p>
            </div>
            {withTopicSpaceOption && (
              <div className="pointer-events-auto flex flex-col items-center gap-2">
                <p className="text-sm text-gray-300">
                  または既存のリポジトリを選択
                </p>

                <Button
                  onClick={onSelectExistingRepository}
                  className="px-6 py-3 text-white hover:bg-slate-600"
                >
                  既存のリポジトリを選択
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </DropFileProviderDashed>
  );
};
