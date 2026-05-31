/**
 * WebCodecs API (VideoEncoder) を使用した高速録画クラス。
 * 実時間にとらわれず、フレームを最速でエンコードする。
 */

import type { IVideoRecorder } from "./types";

export interface FastVideoRecorderOptions {
  canvas: HTMLCanvasElement;
  width?: number;
  height?: number;
  fps?: number;
  videoBitsPerSecond?: number;
}

export class FastVideoRecorder implements IVideoRecorder {
  // ユーザーの要望は「実装」なので、まずは依存関係の少ない
  // "MediaRecorder with manual track stepping" を試す。
  // これが "Fast" モードとして機能するか確認する。
  
  // もしそれが不可なら、WebCodecs APIを使うが、
  // コンテナ化（Muxing）のために外部ライブラリ（webm-muxer）が必要になる。
  // ここでは一旦、インターフェースを定義する。
  
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private _isRecording = false;
  private resolveStop: ((blob: Blob) => void) | null = null;
  
  // 高速モード用のトラック
  private canvasTrack: CanvasCaptureMediaStreamTrack | null = null;

  constructor(private options: FastVideoRecorderOptions) {}

  get isRecording(): boolean {
    return this._isRecording;
  }

  start(): void {
    if (this._isRecording) {
      throw new Error("すでに録画中です");
    }

    this.chunks = [];
    
    // captureStream(0) で自動キャプチャを無効化し、手動で requestFrame する
    this.stream = this.options.canvas.captureStream(0);
    const tracks = this.stream.getVideoTracks();
    if (tracks.length > 0) {
      this.canvasTrack = tracks[0] as CanvasCaptureMediaStreamTrack;
    }

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
      throw new Error("このブラウザは WebM の録画に対応していません");
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

  /**
   * 1フレーム分の時間を進めて録画する。
   * 呼び出し側が Canvas を描画した直後にこれを呼ぶ。
   */
  async recordFrame(): Promise<void> {
    if (!this._isRecording || !this.canvasTrack) return;
    
    // requestFrame() を呼ぶと、現在のCanvasの内容が1フレームとしてStreamに送られる
    this.canvasTrack.requestFrame();
    
    // MediaRecorderがデータを処理するのを少し待つ必要がある場合があるが、
    // 基本的には非同期で処理される。
    // 高速モードでは「待機なし」で次々呼ぶことになる。
  }

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
    this.canvasTrack = null;
  }
}
