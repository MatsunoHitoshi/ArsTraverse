/**
 * ONNX Runtime Web configuration for NDLOCR workers (Next.js / same-origin WASM).
 */

import * as ort from "onnxruntime-web/wasm";

const WASM_BASE_PATH = "/ocr/wasm/";

function initializeONNX() {
  ort.env.wasm.wasmPaths = WASM_BASE_PATH;
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = "warning";
  ort.env.wasm.proxy = false;
}

export async function createSession(
  modelData: ArrayBuffer,
  options: Partial<ort.InferenceSession.SessionOptions> = {},
): Promise<ort.InferenceSession> {
  const defaultOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: ["wasm"],
    logSeverityLevel: 4,
    graphOptimizationLevel: "basic",
    enableCpuMemArena: false,
    enableMemPattern: false,
    ...options,
  };

  try {
    return await ort.InferenceSession.create(modelData, defaultOptions);
  } catch (error) {
    console.error("Failed to create ONNX session:", error);
    throw error;
  }
}

initializeONNX();

export { ort };
