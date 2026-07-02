"use client";

import type { OcrMetadata } from "@/server/api/schemas/scan";
import {
  cropRegionToImageData,
  loadImageBitmapFromFile,
} from "@/features/field/ocr/image-crop";
import type {
  OcrProgressHandler,
  OcrResult,
} from "@/features/field/ocr/ocr-types";
import {
  DEFAULT_OCR_REGION,
  type NormalizedOcrRegion,
} from "@/features/field/ocr/region-types";
import type {
  WorkerInMessage,
  WorkerOutMessage,
} from "@/features/field/ocr/ndlocr/types/worker";

const NDL_OCR_ENGINE = "ndlocr-lite-web";
const INIT_TIMEOUT_MS = 10 * 60 * 1000;

function isMobileDevice(): boolean {
  return /iPhone|iPad|Android/i.test(navigator.userAgent);
}

function mapStageToStatus(stage: string): string {
  switch (stage) {
    case "initializing":
      return "ndlocr_initializing";
    case "loading_models":
      return "ndlocr_loading_models";
    case "initializing_models":
      return "ndlocr_initializing_models";
    case "layout_detection":
      return "ndlocr_layout_detection";
    case "text_recognition":
      return "ndlocr_text_recognition";
    case "reading_order":
      return "ndlocr_reading_order";
    case "generating_output":
      return "ndlocr_generating_output";
    default:
      return "ndlocr_preparing";
  }
}

let workerInstance: Worker | null = null;
let workerInitPromise: Promise<void> | null = null;

function createWorker(): Worker {
  return new Worker(
    new URL("./worker/ocr.worker.ts", import.meta.url),
  );
}

function formatWorkerLoadError(event: ErrorEvent): string {
  const details = [event.message, event.filename, event.lineno]
    .filter((value) => value != null && value !== "")
    .join(" ");
  return details.length > 0
    ? `NDLOCR worker failed to load: ${details}`
    : "NDLOCR worker failed to load";
}

function resetWorkerState(): void {
  if (workerInstance) {
    workerInstance.terminate();
  }
  workerInstance = null;
  workerInitPromise = null;
}

async function getInitializedWorker(
  onProgress?: OcrProgressHandler,
): Promise<Worker> {
  if (!workerInstance) {
    workerInstance = createWorker();
    onProgress?.({ progress: 0, status: "ndlocr_initializing" });

    workerInitPromise = new Promise<void>((resolve, reject) => {
      const worker = workerInstance!;
      let settled = false;

      const cleanup = () => {
        clearTimeout(timeoutId);
        worker.removeEventListener("message", handler);
        worker.onerror = null;
        worker.onmessageerror = null;
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        resetWorkerState();
        reject(error);
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const timeoutId = setTimeout(() => {
        fail(
          new Error(
            "NDLOCR initialization timed out. Check your network connection and try again.",
          ),
        );
      }, INIT_TIMEOUT_MS);

      worker.onerror = (event) => {
        fail(new Error(formatWorkerLoadError(event)));
      };

      worker.onmessageerror = () => {
        fail(new Error("NDLOCR worker failed to deserialize a message"));
      };

      const handler = (event: MessageEvent<WorkerOutMessage>) => {
        const message = event.data;

        if (message.type === "OCR_PROGRESS") {
          if (message.stage === "initialized") {
            succeed();
            return;
          }

          onProgress?.({
            progress: message.progress,
            status: mapStageToStatus(message.stage),
          });
          return;
        }

        if (message.type === "OCR_ERROR" && !message.id) {
          fail(new Error(message.error));
        }
      };

      worker.addEventListener("message", handler);
      worker.postMessage({
        type: "INITIALIZE",
        layoutOnly: isMobileDevice(),
      } satisfies WorkerInMessage);
    });
  }

  if (workerInitPromise) {
    await workerInitPromise;
  }

  return workerInstance;
}

function processRegion(
  worker: Worker,
  imageData: ImageData,
  regionIndex: number,
  regionCount: number,
  onProgress?: OcrProgressHandler,
): Promise<{ plainText: string; confidence?: number }> {
  return new Promise((resolve, reject) => {
    const id = `field-region-${Date.now()}-${regionIndex}`;

    const handler = (event: MessageEvent<WorkerOutMessage>) => {
      const message = event.data;
      if (message.id !== id) return;

      if (message.type === "OCR_PROGRESS") {
        onProgress?.({
          progress: message.progress,
          status: mapStageToStatus(message.stage),
          regionIndex,
          regionCount,
        });
        return;
      }

      if (message.type === "OCR_COMPLETE") {
        worker.removeEventListener("message", handler);
        const confidences = message.textBlocks
          .map((block) => block.confidence)
          .filter((value) => Number.isFinite(value));
        const confidence =
          confidences.length > 0
            ? confidences.reduce((sum, value) => sum + value, 0) /
              confidences.length
            : undefined;

        resolve({
          plainText: message.txt.trim(),
          confidence,
        });
        return;
      }

      if (message.type === "OCR_ERROR") {
        worker.removeEventListener("message", handler);
        reject(new Error(message.error));
      }
    };

    worker.addEventListener("message", handler);
    worker.postMessage(
      {
        type: "OCR_PROCESS",
        id,
        imageData,
        startTime: Date.now(),
      } satisfies WorkerInMessage,
      [imageData.data.buffer],
    );
  });
}

export async function runNdlOcrOnRegions(
  file: File,
  regions: NormalizedOcrRegion[],
  onProgress?: OcrProgressHandler,
): Promise<OcrResult> {
  const effectiveRegions =
    regions.length > 0 ? regions : [DEFAULT_OCR_REGION];

  const worker = await getInitializedWorker(onProgress);
  const bitmap = await loadImageBitmapFromFile(file);

  try {
    const textParts: string[] = [];
    let confidenceSum = 0;
    let recognizedCount = 0;

    for (let index = 0; index < effectiveRegions.length; index++) {
      const region = effectiveRegions[index]!;
      onProgress?.({
        progress: 0,
        status: "ndlocr_text_recognition",
        regionIndex: index,
        regionCount: effectiveRegions.length,
      });

      const imageData = cropRegionToImageData(bitmap, region);
      const result = await processRegion(
        worker,
        imageData,
        index,
        effectiveRegions.length,
        onProgress,
      );

      if (result.plainText) {
        textParts.push(result.plainText);
      }
      if (result.confidence != null) {
        confidenceSum += result.confidence;
        recognizedCount += 1;
      }
    }

    return {
      plainText: textParts.join("\n\n"),
      ocrMetadata: {
        engine: NDL_OCR_ENGINE,
        language: "jpn_vert",
        confidence:
          recognizedCount > 0 ? confidenceSum / recognizedCount : undefined,
        regions: effectiveRegions,
        processedAt: new Date().toISOString(),
      } satisfies OcrMetadata,
    };
  } finally {
    bitmap.close();
  }
}

export function terminateNdlOcrWorker(): void {
  if (!workerInstance) return;
  workerInstance.postMessage({ type: "TERMINATE" } satisfies WorkerInMessage);
  resetWorkerState();
}
