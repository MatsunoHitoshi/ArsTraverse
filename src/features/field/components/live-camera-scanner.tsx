"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/app/_components/button/button";
import { ChevronLeftIcon } from "@/app/_components/icons";

type LiveCameraScannerProps = {
  onCapture: (file: File) => void;
  onOpenFilePicker: () => void;
  onBack: () => void;
};

export function LiveCameraScanner({
  onCapture,
  onOpenFilePicker,
  onBack,
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {isStarting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-sm text-slate-200">
          カメラを起動中...
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
        <div className="pointer-events-auto flex px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onBack}
            aria-label="戻る"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            <ChevronLeftIcon width={20} height={20} color="white" />
          </button>
        </div>

        <div className="pointer-events-none flex-1" />

        {errorMessage && (
          <p className="pointer-events-auto mx-4 mb-2 rounded-lg bg-red-950/80 px-3 py-2 text-center text-xs text-red-200 backdrop-blur-sm">
            {errorMessage}
          </p>
        )}

        <div className="pointer-events-auto flex items-center justify-between px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <Button
            onClick={onOpenFilePicker}
            className="min-w-[7.5rem] bg-black/45 px-3 py-2 text-xs text-white backdrop-blur-sm hover:bg-black/60"
            size="small"
          >
            ファイルから追加
          </Button>
          <button
            type="button"
            onClick={handleCapture}
            disabled={!canCapture}
            aria-label="撮影する"
            className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-full border-4 border-white bg-orange-400 shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="min-w-[7.5rem]" aria-hidden />
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
