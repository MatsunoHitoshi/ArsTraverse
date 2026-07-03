import { createRequire } from "node:module";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const require = createRequire(import.meta.url);

type PDFParseResult = {
  text: string;
  numpages: number;
};

async function parseWithPdfParse(buffer: Buffer): Promise<PDFParseResult> {
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
    data: Buffer,
  ) => Promise<PDFParseResult>;
  return pdfParse(buffer);
}

async function parseWithPdfLoader(buffer: Buffer): Promise<string> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pdf-loader-"));
  const tmpPath = path.join(tmpDir, "input.pdf");
  try {
    await fs.promises.writeFile(tmpPath, buffer);
    const loader = new PDFLoader(tmpPath);
    const docs = await loader.load();
    return docs.map((doc) => doc.pageContent).join("\n\n").trim();
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

export type PdfBufferParseResult = {
  text: string;
  pageCount: number;
  method: "pdf-parse" | "pdf-loader";
};

export async function extractTextLayerFromPdfBuffer(
  buffer: Buffer,
): Promise<PdfBufferParseResult> {
  try {
    const parsed = await parseWithPdfParse(buffer);
    const text = parsed.text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text) {
      return {
        text,
        pageCount: Math.max(parsed.numpages, 1),
        method: "pdf-parse",
      };
    }
  } catch (error) {
    console.warn("pdf-parse failed, falling back to PDFLoader:", error);
  }

  const loaderText = await parseWithPdfLoader(buffer);
  return {
    text: loaderText,
    pageCount: Math.max(1, loaderText ? loaderText.split("\f").length : 1),
    method: "pdf-loader",
  };
}
