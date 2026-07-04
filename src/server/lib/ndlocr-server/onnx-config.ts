import * as ort from "onnxruntime-node";

export async function createOnnxSession(
  modelData: ArrayBuffer,
): Promise<ort.InferenceSession> {
  return ort.InferenceSession.create(modelData, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "basic",
  });
}

export { ort };
