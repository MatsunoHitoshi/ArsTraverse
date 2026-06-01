const JPEG_QUALITY = 0.95;

const CAMERA_CONSTRAINT_CANDIDATES: MediaStreamConstraints[] = [
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 3840 },
      height: { ideal: 2160 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },
  {
    video: {
      facingMode: { ideal: "environment" },
    },
    audio: false,
  },
];

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function createScanImageFile(blob: Blob, mimeType: string): File {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = extensionForMimeType(mimeType);
  return new File([blob], `scan-${timestamp}.${extension}`, { type: mimeType });
}

function isImageCaptureSupported(): boolean {
  return typeof ImageCapture !== "undefined";
}

async function applyMaxStreamConstraints(track: MediaStreamTrack): Promise<void> {
  const capabilities = track.getCapabilities?.();
  if (!capabilities) return;

  const width = capabilities.width;
  const height = capabilities.height;
  if (!width?.max && !height?.max) return;

  try {
    await track.applyConstraints({
      width: width?.max ? { ideal: width.max } : undefined,
      height: height?.max ? { ideal: height.max } : undefined,
    });
  } catch {
    // Device may reject max constraints; keep negotiated stream.
  }
}

export async function openCameraStreamWithFallback(): Promise<MediaStream> {
  let lastError: unknown;

  for (const constraints of CAMERA_CONSTRAINT_CANDIDATES) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      if (track) {
        await applyMaxStreamConstraints(track);
      }
      return stream;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("カメラを起動できませんでした");
}

async function captureWithImageCapture(
  track: MediaStreamTrack,
): Promise<File | null> {
  if (!isImageCaptureSupported()) return null;

  try {
    const imageCapture = new ImageCapture(track);
    const settings: PhotoSettings = {};

    if (typeof imageCapture.getPhotoCapabilities === "function") {
      const capabilities = await imageCapture.getPhotoCapabilities();
      if (capabilities.imageWidth?.max) {
        settings.imageWidth = capabilities.imageWidth.max;
      }
      if (capabilities.imageHeight?.max) {
        settings.imageHeight = capabilities.imageHeight.max;
      }
    }

    const blob = await imageCapture.takePhoto(
      Object.keys(settings).length > 0 ? settings : undefined,
    );
    const mimeType = blob.type || "image/jpeg";
    return createScanImageFile(blob, mimeType);
  } catch {
    return null;
  }
}

function captureFromVideoElement(video: HTMLVideoElement): Promise<File> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) {
    return Promise.reject(new Error("カメラ映像の解像度を取得できませんでした"));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas が利用できません"));
  }

  ctx.drawImage(video, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("撮影画像の生成に失敗しました"));
          return;
        }
        resolve(createScanImageFile(blob, "image/jpeg"));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

/**
 * Prefer high-resolution still capture (ImageCapture API), then fall back to
 * grabbing a frame from the live preview video element.
 */
export async function captureStillPhotoFromStream(
  stream: MediaStream,
  video: HTMLVideoElement,
): Promise<File> {
  const track = stream.getVideoTracks()[0];
  if (track) {
    const still = await captureWithImageCapture(track);
    if (still) return still;
  }

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("カメラ映像の準備がタイムアウトしました"));
      }, 5000);

      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("カメラ映像の準備に失敗しました"));
      };
      const cleanup = () => {
        clearTimeout(timeoutId);
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
    });
  }

  return captureFromVideoElement(video);
}

export function stopCameraStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
