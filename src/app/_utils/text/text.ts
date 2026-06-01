import { DocumentType } from "@prisma/client";
import { isFetchableStoragePublicUrl } from "../supabase/storage-url";
import { writeLocalFileFromUrl } from "../sys/file";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { BUCKETS } from "../supabase/const";

export const getTextFromDocumentFile = async (
  url: string,
  type: DocumentType,
) => {
  if (type === DocumentType.INPUT_PDF) {
    const localFilePath = await writeLocalFileFromUrl(url, "input.pdf");
    const loader = new PDFLoader(localFilePath);
    const documents = await loader.load();
    return documents.map((doc) => doc.pageContent).join("\n");
  }

  if (!isFetchableStoragePublicUrl(url, BUCKETS.PATH_TO_INPUT_TXT)) {
    throw new Error("ドキュメント本文の取得に失敗しました");
  }

  const response = await fetch(url);
  const text = await response.text();

  if (
    !response.ok ||
    (text.startsWith("{") &&
      text.includes('"InvalidKey"') &&
      text.includes('"statusCode"'))
  ) {
    throw new Error("ドキュメント本文の取得に失敗しました");
  }

  return text;
};
