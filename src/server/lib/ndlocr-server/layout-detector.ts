import type * as OrtType from "onnxruntime-node";
import type {
  LayoutDetectionResult,
  PageBlock,
  TextRegion,
} from "@/features/field/ocr/ndlocr/types/ocr";
import {
  createOffscreenCanvas,
  getCanvas2dContext,
  type ServerImageData,
} from "@/server/lib/ndlocr-server/canvas-utils";
import { createOnnxSession, ort } from "@/server/lib/ndlocr-server/onnx-config";

const LINE_CLASS_IDS = new Set([1, 2, 3, 4, 5, 16]);
const BLOCK_CLASS_ID = 0;

interface PreprocessResult {
  tensor: OrtType.Tensor;
  metadata: {
    originalWidth: number;
    originalHeight: number;
    maxWH: number;
    inputWidth: number;
    inputHeight: number;
  };
}

export class ServerLayoutDetector {
  private session: OrtType.InferenceSession | null = null;
  private inputSize = { width: 800, height: 800 };
  private initialized = false;

  async initialize(modelData: ArrayBuffer): Promise<void> {
    if (this.initialized) return;
    this.session = await createOnnxSession(modelData);
    this.initialized = true;
  }

  async detect(imageData: ServerImageData): Promise<LayoutDetectionResult> {
    if (!this.initialized || !this.session) {
      throw new Error("Layout detector not initialized");
    }

    const { tensor, metadata } = await this.preprocessImage(imageData);
    const inputNames = this.session.inputNames;
    const primaryInput = inputNames[0];
    if (!primaryInput) {
      throw new Error("Layout model has no inputs");
    }

    const inputs: Record<string, OrtType.Tensor> = {
      [primaryInput]: tensor,
    };
    const shapeInput = inputNames[1];
    if (shapeInput) {
      inputs[shapeInput] = new ort.Tensor(
        "int64",
        BigInt64Array.from([
          BigInt(this.inputSize.height),
          BigInt(this.inputSize.width),
        ]),
        [1, 2],
      );
    }

    const output = await this.session.run(inputs);
    return this.postprocessOutput(output, metadata);
  }

  private async preprocessImage(imageData: ServerImageData): Promise<PreprocessResult> {
    const originalSize = { width: imageData.width, height: imageData.height };
    const maxWH = Math.max(originalSize.width, originalSize.height);
    const imageCanvas = createOffscreenCanvas(imageData.width, imageData.height);
    const imageCtx = getCanvas2dContext(imageCanvas);
    imageCtx.putImageData(imageData, 0, 0);

    const scale = this.inputSize.width / maxWH;
    const canvas = createOffscreenCanvas(this.inputSize.width, this.inputSize.height);
    const ctx = getCanvas2dContext(canvas);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillRect(0, 0, this.inputSize.width, this.inputSize.height);
    ctx.drawImage(
      imageCanvas,
      0,
      0,
      imageData.width,
      imageData.height,
      0,
      0,
      Math.round(imageData.width * scale),
      Math.round(imageData.height * scale),
    );

    const resizedImageData = ctx.getImageData(
      0,
      0,
      this.inputSize.width,
      this.inputSize.height,
    );
    const { data } = resizedImageData;
    const tensorData = new Float32Array(
      1 * 3 * this.inputSize.height * this.inputSize.width,
    );
    const mean = [123.675, 116.28, 103.53];
    const std = [58.395, 57.12, 57.375];

    for (let h = 0; h < this.inputSize.height; h++) {
      for (let w = 0; w < this.inputSize.width; w++) {
        const pixelOffset = (h * this.inputSize.width + w) * 4;
        for (let c = 0; c < 3; c++) {
          const tensorIdx =
            c * this.inputSize.height * this.inputSize.width +
            h * this.inputSize.width +
            w;
          const channelValue = data[pixelOffset + c] ?? 0;
          tensorData[tensorIdx] =
            (channelValue - (mean[c] ?? 0)) / (std[c] ?? 1);
        }
      }
    }

    return {
      tensor: new ort.Tensor("float32", tensorData, [
        1,
        3,
        this.inputSize.height,
        this.inputSize.width,
      ]),
      metadata: {
        originalWidth: originalSize.width,
        originalHeight: originalSize.height,
        maxWH,
        inputWidth: this.inputSize.width,
        inputHeight: this.inputSize.height,
      },
    };
  }

  private postprocessOutput(
    output: Record<string, OrtType.Tensor>,
    metadata: PreprocessResult["metadata"],
  ): LayoutDetectionResult {
    const lineDetections: TextRegion[] = [];
    const blockDetections: PageBlock[] = [];
    const outputNames = this.session!.outputNames;
    const classOutputName = outputNames[0];
    const bboxOutputName = outputNames[1];
    const scoreOutputName = outputNames[2];
    const charCountOutputName = outputNames[3];

    if (!classOutputName || !bboxOutputName || !scoreOutputName) {
      throw new Error("Layout model missing expected outputs");
    }

    const classOutput = output[classOutputName];
    const bboxOutput = output[bboxOutputName];
    const scoreOutput = output[scoreOutputName];
    if (!classOutput || !bboxOutput || !scoreOutput) {
      throw new Error("Layout model output tensors are missing");
    }

    const classIdsRaw = classOutput.data as ArrayLike<number>;
    const bboxesData = bboxOutput.data as Float32Array;
    const scoresData = scoreOutput.data as Float32Array;
    const charCountTensor = charCountOutputName
      ? output[charCountOutputName]
      : undefined;
    const charCountsData = charCountTensor
      ? (charCountTensor.data as Float32Array)
      : null;
    const scaleX = metadata.maxWH / this.inputSize.width;
    const scaleY = metadata.maxWH / this.inputSize.height;
    const confThreshold = 0.3;

    for (let i = 0; i < scoresData.length; i++) {
      const score = scoresData[i]!;
      if (score < confThreshold) continue;
      const classId = Number(classIdsRaw[i]) - 1;
      const x1 = bboxesData[i * 4 + 0]! * scaleX;
      const y1 = bboxesData[i * 4 + 1]! * scaleY;
      const x2 = bboxesData[i * 4 + 2]! * scaleX;
      const y2 = bboxesData[i * 4 + 3]! * scaleY;

      if (classId === BLOCK_CLASS_ID) {
        const finalX1 = Math.max(0, Math.round(x1));
        const finalY1 = Math.max(0, Math.round(y1));
        const finalX2 = Math.min(metadata.originalWidth, Math.round(x2));
        const finalY2 = Math.min(metadata.originalHeight, Math.round(y2));
        const width = finalX2 - finalX1;
        const height = finalY2 - finalY1;
        if (width >= 10 && height >= 10) {
          blockDetections.push({ x: finalX1, y: finalY1, width, height });
        }
      } else if (LINE_CLASS_IDS.has(classId)) {
        const boxHeight = y2 - y1;
        const deltaH = boxHeight * 0.02;
        const finalX1 = Math.max(0, Math.round(x1));
        const finalY1 = Math.max(0, Math.round(y1 - deltaH));
        const finalX2 = Math.min(metadata.originalWidth, Math.round(x2));
        const finalY2 = Math.min(metadata.originalHeight, Math.round(y2 + deltaH));
        const width = finalX2 - finalX1;
        const height = finalY2 - finalY1;
        if (width >= 10 && height >= 10) {
          lineDetections.push({
            x: finalX1,
            y: finalY1,
            width,
            height,
            confidence: score,
            classId,
            charCountCategory: charCountsData ? charCountsData[i] : 100,
          });
        }
      }
    }

    return { lines: this.nms(lineDetections), blocks: blockDetections };
  }

  private nms(detections: TextRegion[], iouThreshold = 0.5): TextRegion[] {
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    const keep: TextRegion[] = [];
    for (const detection of sorted) {
      if (keep.every((item) => this.iou(item, detection) < iouThreshold)) {
        keep.push(detection);
      }
    }
    return keep;
  }

  private iou(a: TextRegion, b: TextRegion): number {
    const ax2 = a.x + a.width;
    const ay2 = a.y + a.height;
    const bx2 = b.x + b.width;
    const by2 = b.y + b.height;
    const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
    const inter = ix * iy;
    if (inter === 0) return 0;
    return inter / (a.width * a.height + b.width * b.height - inter);
  }
}
