import type { OcrMetadata } from "@/server/api/schemas/scan";

export type OcrLanguage = "jpn" | "jpn_vert" | "eng";

export type OcrResult = {
  plainText: string;
  ocrMetadata: OcrMetadata;
};

export type OcrProgressUpdate = {
  progress: number;
  status: string;
  regionIndex?: number;
  regionCount?: number;
};

export type OcrProgressHandler = (update: OcrProgressUpdate) => void;
