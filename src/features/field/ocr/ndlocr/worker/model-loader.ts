/**
 * ONNX model download and IndexedDB cache (adapted from ndlocrlite-web).
 */

const DB_NAME = "NDLOCRLiteDB";
const DB_VERSION = 2;
const STORE_NAME = "models";

export const MODEL_VERSION = "2.0.0";

function resolveModelBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_NDL_OCR_MODEL_BASE_URL) {
    return process.env.NEXT_PUBLIC_NDL_OCR_MODEL_BASE_URL;
  }

  if (typeof self !== "undefined" && self.location?.origin) {
    return `${self.location.origin}/api/ndlocr-models`;
  }

  return "/api/ndlocr-models";
}

const MODEL_BASE = resolveModelBaseUrl();

export const MODEL_URLS: Record<string, string> = {
  layout: `${MODEL_BASE}/layout`,
  recognition30: `${MODEL_BASE}/recognition30`,
  recognition50: `${MODEL_BASE}/recognition50`,
  recognition100: `${MODEL_BASE}/recognition100`,
};

function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("models")) {
        db.createObjectStore("models", { keyPath: "name" });
      }
      if (db.objectStoreNames.contains("results")) {
        db.deleteObjectStore("results");
      }
      const resultsStore = db.createObjectStore("results", { keyPath: "id" });
      resultsStore.createIndex("by_createdAt", "createdAt", { unique: false });
    };
  });
}

async function getModelFromCache(
  modelName: string,
): Promise<ArrayBuffer | undefined> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(modelName);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const entry = request.result as
        | { version?: string; data?: ArrayBuffer }
        | undefined;
      if (entry && entry.version === MODEL_VERSION && entry.data) {
        resolve(entry.data);
      } else {
        resolve(undefined);
      }
    };
  });
}

async function saveModelToCache(
  modelName: string,
  data: ArrayBuffer,
): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      name: modelName,
      data,
      cachedAt: Date.now(),
      version: MODEL_VERSION,
    });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function downloadWithProgress(
  url: string,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(`Model file not found (HTML returned): ${url}`);
  }

  const contentLength = Number.parseInt(
    response.headers.get("content-length") ?? "0",
    10,
  );
  let receivedLength = 0;

  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    receivedLength += value.length;

    if (onProgress && contentLength > 0) {
      onProgress(receivedLength / contentLength);
    }
  }

  const allChunks = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }

  return allChunks.buffer;
}

export async function loadModel(
  modelType: string,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> {
  const modelUrl = MODEL_URLS[modelType];
  if (!modelUrl) {
    throw new Error(`Unknown model type: ${modelType}`);
  }

  const cached = await getModelFromCache(modelType);
  if (cached) {
    onProgress?.(1);
    return cached;
  }

  const modelData = await downloadWithProgress(modelUrl, onProgress);
  await saveModelToCache(modelType, modelData);
  return modelData;
}
