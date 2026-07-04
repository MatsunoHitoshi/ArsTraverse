import path from "node:path";
import { createRequire } from "node:module";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ServerImageData } from "@/server/lib/ndlocr-server/canvas-utils";

const require = createRequire(import.meta.url);

export type RasterizedPdfPage = {
  pageNumber: number;
  width: number;
  height: number;
  imageData: ServerImageData;
  pngBuffer: Buffer;
};

function ensurePdfJsNodePolyfills() {
  const canvas = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
  if (!globalThis.DOMMatrix && canvas.DOMMatrix) {
    globalThis.DOMMatrix = canvas.DOMMatrix as typeof DOMMatrix;
  }
  if (!globalThis.Path2D && canvas.Path2D) {
    globalThis.Path2D = canvas.Path2D as typeof Path2D;
  }
}

function getPdfJsAssetUrls() {
  const pdfjsDistPath = path.dirname(require.resolve("pdfjs-dist/package.json"));
  return {
    cMapUrl: `${path.join(pdfjsDistPath, "cmaps")}/`,
    standardFontDataUrl: `${path.join(pdfjsDistPath, "standard_fonts")}/`,
  };
}

async function rasterizeWithPdfJs(
  buffer: Buffer,
  options?: {
    maxPages?: number;
    startPage?: number;
    scale?: number;
  },
): Promise<{ pageCount: number; pages: RasterizedPdfPage[] }> {
  ensurePdfJsNodePolyfills();
  const scale = options?.scale ?? 2;
  const startPage = options?.startPage ?? 1;
  const maxPages = options?.maxPages ?? Number.POSITIVE_INFINITY;
  const assetUrls = getPdfJsAssetUrls();

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    cMapUrl: assetUrls.cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: assetUrls.standardFontDataUrl,
  });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const endPage = Math.min(pageCount, startPage + maxPages - 1);
  const pages: RasterizedPdfPage[] = [];

  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context の取得に失敗しました");
    }

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    const imageData = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    pages.push({
      pageNumber,
      width: canvas.width,
      height: canvas.height,
      imageData,
      pngBuffer: canvas.toBuffer("image/png"),
    });
  }

  return { pageCount, pages };
}

async function rasterizeWithMuPdf(
  buffer: Buffer,
  options?: {
    maxPages?: number;
    startPage?: number;
    scale?: number;
  },
): Promise<{ pageCount: number; pages: RasterizedPdfPage[] }> {
  const mupdf = await import("mupdf");
  const scale = options?.scale ?? 2.5;
  const startPage = options?.startPage ?? 1;
  const maxPages = options?.maxPages ?? Number.POSITIVE_INFINITY;

  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  try {
    const pageCount = doc.countPages();
    const endPage = Math.min(pageCount, startPage + maxPages - 1);
    const pages: RasterizedPdfPage[] = [];
    const matrix = mupdf.Matrix.scale(scale, scale);

    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
      const page = doc.loadPage(pageNumber - 1);
      try {
        const pixmap = page.toPixmap(
          matrix,
          mupdf.ColorSpace.DeviceRGB,
          false,
          true,
        );
        try {
          const png = pixmap.asPNG();
          const img = await loadImage(png);
          const canvas = createCanvas(img.width, img.height);
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Canvas 2D context の取得に失敗しました");
          }
          context.drawImage(img, 0, 0);
          const imageData = context.getImageData(0, 0, img.width, img.height);

          pages.push({
            pageNumber,
            width: img.width,
            height: img.height,
            imageData,
            pngBuffer: Buffer.from(png),
          });
        } finally {
          destroyMuPdfResource(pixmap);
        }
      } finally {
        destroyMuPdfResource(page);
      }
    }

    return { pageCount, pages };
  } finally {
    destroyMuPdfResource(doc);
  }
}

function destroyMuPdfResource(resource: unknown): void {
  if (
    resource &&
    typeof resource === "object" &&
    "destroy" in resource &&
    typeof resource.destroy === "function"
  ) {
    resource.destroy();
  }
}

export async function rasterizePdfPages(
  buffer: Buffer,
  options?: {
    maxPages?: number;
    startPage?: number;
    scale?: number;
  },
): Promise<{ pageCount: number; pages: RasterizedPdfPage[] }> {
  try {
    return await rasterizeWithMuPdf(buffer, options);
  } catch (error) {
    console.warn(
      "MuPDF rasterization failed, falling back to pdf.js:",
      error instanceof Error ? error.message : error,
    );
    return rasterizeWithPdfJs(buffer, options);
  }
}
