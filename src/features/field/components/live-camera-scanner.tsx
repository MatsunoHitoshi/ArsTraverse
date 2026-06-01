"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/app/_components/button/button";

type LiveCameraScannerProps = {
  onCapture: (file: File) => void;
  onOpenFilePicker: () => void;
  className?: string;
};

export function LiveCameraScanner({
  onCapture,
  onOpenFilePicker,
  className = "",
}: LiveCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canCapture = useMemo(
    () => !isStarting && !errorMessage,
    [isStarting, errorMessage],
  );

  useEffect(() => {
    let isActive = true;

    const start = async () => {
      try {
        setIsStarting(true);
        setErrorMessage(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });
        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setErrorMessage(
          "カメラを起動できませんでした。ファイル選択から画像を追加してください。",
        );
      } finally {
        if (isActive) {
          setIsStarting(false);
        }
      }
    };

    void start();

    return () => {
      isActive = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !canCapture) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width <= 0 || height <= 0) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const file = new File([blob], `scan-${timestamp}.jpg`, {
          type: "image/jpeg",
        });
        onCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <section
      className={`rounded-xl border border-slate-700 bg-slate-800/60 p-4 ${className}`}
    >
      <label className="mb-2 block text-sm font-medium text-slate-200">
        1. カメラで撮影
      </label>

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-slate-900">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />
        {isStarting && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
            カメラを起動中...
          </div>
        )}
      </div>

      {errorMessage && (
        <p className="mt-2 text-xs text-red-300">{errorMessage}</p>
      )}

      <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-900/70 px-3 py-2">
        <Button
          onClick={onOpenFilePicker}
          className="bg-slate-700 px-2 py-1 text-xs text-white"
          size="small"
        >
          ファイルから追加
        </Button>
        <button
          type="button"
          onClick={handleCapture}
          disabled={!canCapture}
          aria-label="撮影する"
          className="h-14 w-14 rounded-full border-4 border-white bg-orange-400 transition disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="w-[88px]" />
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </section>
  );
}
