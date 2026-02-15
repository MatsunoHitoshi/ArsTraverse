import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { Document } from "@langchain/core/documents";
import { TokenTextSplitter } from "langchain/text_splitter";
import * as fs from "fs";

// pdf-parseの型定義
interface PDFData {
  numpages: number;
  numrender: number;
  info: Record<string, unknown>;
  metadata: Record<string, unknown>;
  version: string;
  text: string;
}

type PDFParseFunction = (buffer: Buffer) => Promise<PDFData>;

// pdf-parseを使用した改良されたPDFテキスト抽出関数
const extractTextFromPDF = async (filePath: string): Promise<string[]> => {
  try {
    // pdf-parseを使用（より高精度なテキスト抽出）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse") as PDFParseFunction;
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);

    // テキストをページごとに分割（簡易的な実装）
    const fullText = pdfData.text;

    // テキストを適切にクリーンアップ
    const cleanedText = fullText
      .replace(/\r\n/g, "\n") // Windows改行を統一
      .replace(/\r/g, "\n") // Mac改行を統一
      .replace(/\n{3,}/g, "\n\n") // 複数の改行を2つに制限
      .replace(/\s+/g, " ") // 複数の空白を単一に
      .trim();

    // ページ分割のヒューリスティック（実際のページ数に基づく）
    const estimatedPageLength = Math.ceil(
      cleanedText.length / pdfData.numpages,
    );
    const textChunks = [];

    for (let i = 0; i < cleanedText.length; i += estimatedPageLength) {
      const chunk = cleanedText.slice(i, i + estimatedPageLength);
      if (chunk.trim()) {
        textChunks.push(chunk.trim());
      }
    }

    return textChunks.length > 0 ? textChunks : [cleanedText];
  } catch (error) {
    console.error("pdf-parseでの抽出に失敗、フォールバックを使用:", error);
    // フォールバック: 元のPDFLoaderを使用
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();
    return docs.map((doc) => doc.pageContent);
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
    const loader = new TextLoader(localFilePath);
    rawDocs = await loader.load();
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
