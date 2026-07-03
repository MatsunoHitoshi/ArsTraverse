import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { Document } from "@langchain/core/documents";
import { TokenTextSplitter } from "@langchain/textsplitters";
import * as fs from "fs";
import { extractPdfTextFromBuffer } from "@/server/lib/pdf/extract-pdf-text";

const extractTextFromPDF = async (filePath: string): Promise<string[]> => {
  const dataBuffer = fs.readFileSync(filePath);
  const extracted = await extractPdfTextFromBuffer(dataBuffer, {
    processOcr: true,
  });
  const fullText = extracted.plainText;
  const pageCount = Math.max(extracted.pageCount, 1);

  const cleanedText = fullText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();

  const estimatedPageLength = Math.ceil(cleanedText.length / pageCount);
  const textChunks: string[] = [];

  for (let i = 0; i < cleanedText.length; i += estimatedPageLength) {
    const chunk = cleanedText.slice(i, i + estimatedPageLength);
    if (chunk.trim()) {
      textChunks.push(chunk.trim());
    }
  }

  if (textChunks.length > 0) {
    return textChunks;
  }

  if (!cleanedText) {
    return [];
  }

  try {
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();
    return docs.map((doc) => doc.pageContent);
  } catch (error) {
    console.error("PDFLoader fallback failed:", error);
    return [cleanedText];
  }
};

export const textInspect = async (
  localFilePath: string,
  isPlaneTextMode: boolean,
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
  },
) => {
  let rawDocs: Document[];

  if (isPlaneTextMode) {
    const text = fs.readFileSync(localFilePath, "utf-8");
    rawDocs = [
      new Document({ pageContent: text, metadata: { source: localFilePath } }),
    ];
  } else {
    // 改良されたPDFテキスト抽出を使用
    const pageTexts = await extractTextFromPDF(localFilePath);
    rawDocs = pageTexts.map(
      (text, index) =>
        new Document({
          pageContent: text,
          metadata: {
            page: index + 1,
            source: localFilePath,
          },
        }),
    );
  }

  const textSplitter = new TokenTextSplitter({
    // 知識グラフ抽出に最適化されたチャンクサイズ
    // コンテキストウィンドウが128,000トークンあっても、2,048-4,096トークンが最適
    // 理由: システムプロンプト(2,000+) + 出力予約(16,000)を考慮し、
    //       エンティティ間の関係を正確に抽出できる適切なサイズを維持
    // より大きなチャンク(8,000+)は精度低下のリスクがある
    chunkSize: options?.chunkSize ?? 2048,
    // オーバーラップを増やしてチャンク境界での情報損失を防ぐ
    // chunkSizeの10-15%が推奨
    chunkOverlap: options?.chunkOverlap ?? 256,
  });

  const documents: Document[] = [];
  await Promise.all(
    rawDocs.map(async (rowDoc) => {
      const chunks = await textSplitter.splitText(rowDoc.pageContent);
      const processedDocs = chunks.map(
        (chunk, index) =>
          new Document({
            pageContent: chunk,
            metadata: {
              a: index + 1,
              ...rowDoc.metadata,
            },
          }),
      );
      documents.push(...processedDocs);
    }),
  );

  return documents;
};

/**
 * プレーンテキストから Document[] を生成する（ファイルを経由しない）。
 * document-form の手入力モードと同様のチャンク分割を行う。
 */
export const textInspectFromPlainText = async (
  plainText: string,
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
  },
): Promise<Document[]> => {
  if (!plainText.trim()) return [];

  const textSplitter = new TokenTextSplitter({
    chunkSize: options?.chunkSize ?? 2048,
    chunkOverlap: options?.chunkOverlap ?? 256,
  });

  const chunks = await textSplitter.splitText(plainText.trim());
  return chunks.map(
    (chunk, index) =>
      new Document({
        pageContent: chunk,
        metadata: { a: index + 1, source: "inline" },
      }),
  );
};
