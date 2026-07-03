import { readFile } from "node:fs/promises";
import path from "node:path";
import * as yaml from "js-yaml";
import type * as OrtType from "onnxruntime-node";
import type {
  TextRegion,
} from "@/features/field/ocr/ndlocr/types/ocr";
import {
  createOffscreenCanvas,
  getCanvas2dContext,
  type ServerImageData,
} from "@/server/lib/ndlocr-server/canvas-utils";
import { createOnnxSession, ort } from "@/server/lib/ndlocr-server/onnx-config";

interface RecognizerConfig {
  inputShape: [number, number, number, number];
  charList: string[];
  maxLength: number;
}

interface RecognitionResult {
  text: string;
  confidence: number;
}

export class ServerTextRecognizer {
  private session: OrtType.InferenceSession | null = null;
  private initialized = false;
  private config: RecognizerConfig;

  constructor(inputShape?: [number, number, number, number]) {
    this.config = {
      inputShape: inputShape ?? [1, 3, 24, 384],
      charList: [],
      maxLength: 25,
    };
  }

  async initialize(modelData: ArrayBuffer): Promise<void> {
    if (this.initialized) return;
    await this.loadConfig();
    this.session = await createOnnxSession(modelData);
    this.initialized = true;
  }

  private async loadConfig(): Promise<void> {
    const configPath = path.join(
      process.cwd(),
      "public",
      "ocr",
      "config",
      "NDLmoji.yaml",
    );
    const yamlText = await readFile(configPath, "utf8");
    const yamlConfig = yaml.load(yamlText) as Record<string, unknown>;
    if (yamlConfig?.text_recognition) {
      const textConfig = yamlConfig.text_recognition as Record<string, unknown>;
      if (textConfig.max_length) {
        this.config.maxLength = textConfig.max_length as number;
      }
    }
    if ((yamlConfig?.model as Record<string, unknown>)?.charset_train) {
      const charsetTrain = (yamlConfig.model as Record<string, unknown>)
        .charset_train as string;
      this.config.charList = charsetTrain.split("");
    }
  }

  async recognizeCropped(croppedImageData: ServerImageData): Promise<RecognitionResult> {
    if (!this.initialized || !this.session) {
      throw new Error("Text recognizer not initialized");
    }
    const inputTensor = this.preprocess(croppedImageData);
    const output = await this.session.run({
      [this.session.inputNames[0]!]: inputTensor,
    });
    return this.decodeOutput(output);
  }

  static cropImageDataBatch(
    imageData: ServerImageData,
    regions: TextRegion[],
  ): ServerImageData[] {
    const sourceCanvas = createOffscreenCanvas(imageData.width, imageData.height);
    const sourceCtx = getCanvas2dContext(sourceCanvas);
    sourceCtx.putImageData(imageData, 0, 0);

    return regions.map((region) => {
      const canvas = createOffscreenCanvas(region.width, region.height);
      const ctx = getCanvas2dContext(canvas);
      ctx.drawImage(
        sourceCanvas,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height,
      );
      return ctx.getImageData(0, 0, region.width, region.height);
    });
  }

  private preprocess(imageData: ServerImageData): OrtType.Tensor {
    const [, channels, height, width] = this.config.inputShape;
    const imgWidth = imageData.width;
    const imgHeight = imageData.height;
    const canvas = createOffscreenCanvas(1, 1);
    const ctx = getCanvas2dContext(canvas);

    if (imgHeight > imgWidth) {
      canvas.width = imgHeight;
      canvas.height = imgWidth;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.translate(-canvas.height / 2, -canvas.width / 2);
    } else {
      canvas.width = imgWidth;
      canvas.height = imgHeight;
    }

    const tempCanvas = createOffscreenCanvas(imgWidth, imgHeight);
    const tempCtx = getCanvas2dContext(tempCanvas);
    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0);

    const resizeCanvas = createOffscreenCanvas(width, height);
    const resizeCtx = getCanvas2dContext(resizeCanvas);
    resizeCtx.drawImage(
      canvas,
      0,
      0,
      width,
      height,
    );

    const resized = resizeCtx.getImageData(0, 0, width, height);
    const { data } = resized;
    const tensorData = new Float32Array(channels * height * width);
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        const pixelOffset = (h * width + w) * 4;
        for (let c = 0; c < channels; c++) {
          const value = (data[pixelOffset + c] ?? 0) / 255.0;
          tensorData[c * height * width + h * width + w] = 2.0 * (value - 0.5);
        }
      }
    }

    return new ort.Tensor("float32", tensorData, this.config.inputShape);
  }

  private decodeOutput(
    outputs: Record<string, OrtType.Tensor>,
  ): RecognitionResult {
    const outputName = this.session!.outputNames[0]!;
    const rawLogits = outputs[outputName]!.data as Float32Array;
    const logits = Array.from(rawLogits).map((value) =>
      typeof value === "bigint" ? Number(value) : value,
    );
    const dims = outputs[outputName]!.dims;
    const seqLength = dims[1] ?? 0;
    const vocabSize = dims[2] ?? 0;
    const resultClassIds: number[] = [];

    for (let i = 0; i < seqLength; i++) {
      const scores = logits.slice(i * vocabSize, (i + 1) * vocabSize);
      const maxScore = Math.max(...scores);
      const maxIndex = scores.indexOf(maxScore);
      if (maxIndex === 0) break;
      if (maxIndex < 4) continue;
      resultClassIds.push(maxIndex - 1);
    }

    const resultChars: string[] = [];
    let prevId = -1;
    for (const id of resultClassIds) {
      if (id !== prevId && id < this.config.charList.length) {
        resultChars.push(this.config.charList[id]!);
        prevId = id;
      }
    }

    return {
      text: resultChars.join("").trim(),
      confidence: 0.9,
    };
  }
}
