/**
 * MediaRecorder のラッパー。
 * Canvas の captureStream() から WebM 動画を録画する。
 */

import type { IVideoRecorder } from "./types";
export type { IVideoRecorder };

export interface VideoRecorderOptions {
  canvas: HTMLCanvasElement;
  fps: number;
  videoBitsPerSecond?: number;
}


export class VideoRecorder implements IVideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private _isRecording = false;
  private resolveStop: ((blob: Blob) => void) | null = null;

  constructor(private options: VideoRecorderOptions) {}

  get isRecording(): boolean {
    return this._isRecording;
  }

  /** 録画を開始する */
  start(): void {
    if (this._isRecording) {
      throw new Error("すでに録画中です");
    }

    this.chunks = [];
    this.stream = this.options.canvas.captureStream(this.options.fps);

    // VP9 > VP8 の順で利用可能なコーデックを選択
    const mimeTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    let selectedMime = "";
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    if (!selectedMime) {
      throw new Error(
        "このブラウザは WebM の録画に対応していません",
      );
    }

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: selectedMime,
      videoBitsPerSecond: this.options.videoBitsPerSecond ?? 5_000_000,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: selectedMime });
      this.chunks = [];
      this._isRecording = false;
      if (this.resolveStop) {
        this.resolveStop(blob);
        this.resolveStop = null;
      }
    };

    this.mediaRecorder.start();
    this._isRecording = true;
  }

  /** 録画を停止し、録画データの Blob を返す */
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this._isRecording) {
        reject(new Error("録画が開始されていません"));
        return;
      }
      this.resolveStop = resolve;
      this.mediaRecorder.stop();
    });
  }

  /** リソースを解放する */
  dispose(): void {
    if (this.mediaRecorder && this._isRecording) {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this._isRecording = false;
    this.resolveStop = null;
  }
}

/** Blob を指定ファイル名でダウンロードする */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 複数の Blob を個別にダウンロードする（少し間隔を空けてブラウザのブロックを回避） */
export async function downloadBlobsSequentially(
  files: Array<{ blob: Blob; filename: string }>,
): Promise<void> {
  for (const file of files) {
    downloadBlob(file.blob, file.filename);
    // ブラウザのポップアップブロック回避のため少し間隔を空ける
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
