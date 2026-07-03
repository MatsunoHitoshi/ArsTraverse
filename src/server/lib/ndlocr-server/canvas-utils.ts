import {
  createCanvas,
  type Canvas,
  type ImageData as NapiImageData,
} from "@napi-rs/canvas";

export type NapiCanvas = Canvas;
export type ServerImageData = NapiImageData;

export function createOffscreenCanvas(width: number, height: number): Canvas {
  return createCanvas(width, height);
}

export function getCanvas2dContext(canvas: Canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context の取得に失敗しました");
  }
  return ctx;
}
