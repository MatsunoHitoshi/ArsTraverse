import { ReadingOrderProcessor } from "@/features/field/ocr/ndlocr/worker/reading-order";
import type { TextBlock } from "@/features/field/ocr/ndlocr/types/ocr";
import type { ServerImageData } from "@/server/lib/ndlocr-server/canvas-utils";
import { loadNdlOcrModel } from "@/server/lib/ndlocr-server/model-loader";
import { ServerLayoutDetector } from "@/server/lib/ndlocr-server/layout-detector";
import { ServerTextRecognizer } from "@/server/lib/ndlocr-server/text-recognizer";

type NdlOcrPageResult = {
  plainText: string;
  confidence: number;
};

let layoutDetector: ServerLayoutDetector | null = null;
let recognizer30: ServerTextRecognizer | null = null;
let recognizer50: ServerTextRecognizer | null = null;
let recognizer100: ServerTextRecognizer | null = null;
let initPromise: Promise<void> | null = null;
const readingOrderProcessor = new ReadingOrderProcessor();

async function ensureLayoutDetector(): Promise<ServerLayoutDetector> {
  if (!initPromise) {
    initPromise = (async () => {
      layoutDetector = new ServerLayoutDetector();
      await layoutDetector.initialize(await loadNdlOcrModel("layout"));
    })();
  }
  await initPromise;
  if (!layoutDetector) {
    throw new Error("Layout detector initialization failed");
  }
  return layoutDetector;
}

async function ensureRecognizers(): Promise<void> {
  await ensureLayoutDetector();
  if (recognizer100) return;

  const [rec30Data, rec50Data, rec100Data] = await Promise.all([
    loadNdlOcrModel("recognition30"),
    loadNdlOcrModel("recognition50"),
    loadNdlOcrModel("recognition100"),
  ]);

  recognizer30 = new ServerTextRecognizer([1, 3, 24, 256]);
  await recognizer30.initialize(rec30Data);
  recognizer50 = new ServerTextRecognizer([1, 3, 24, 384]);
  await recognizer50.initialize(rec50Data);
  recognizer100 = new ServerTextRecognizer([1, 3, 24, 768]);
  await recognizer100.initialize(rec100Data);
}

function selectRecognizer(charCountCategory?: number): ServerTextRecognizer {
  if (charCountCategory === 3 && recognizer30) return recognizer30;
  if (charCountCategory === 2 && recognizer50) return recognizer50;
  if (!recognizer100) {
    throw new Error("Recognition model is not initialized");
  }
  return recognizer100;
}

export async function detectLayoutOnly(
  imageData: ServerImageData,
): Promise<Awaited<ReturnType<ServerLayoutDetector["detect"]>>> {
  const detector = await ensureLayoutDetector();
  return detector.detect(imageData);
}

export async function runNdlOcrOnImage(
  imageData: ServerImageData,
): Promise<NdlOcrPageResult> {
  await ensureRecognizers();
  const detector = layoutDetector;
  if (!detector) {
    throw new Error("Layout detector is not initialized");
  }

  const { lines: textRegions, blocks: pageBlocks } =
    await detector.detect(imageData);
  if (textRegions.length === 0) {
    return { plainText: "", confidence: 0 };
  }

  const croppedImages = ServerTextRecognizer.cropImageDataBatch(
    imageData,
    textRegions,
  );
  const recognitionResults: TextBlock[] = [];

  for (let index = 0; index < textRegions.length; index++) {
    const region = textRegions[index]!;
    const recognizer = selectRecognizer(region.charCountCategory);
    const result = await recognizer.recognizeCropped(croppedImages[index]!);
    recognitionResults.push({
      ...region,
      text: result.text,
      readingOrder: index + 1,
    });
  }

  const orderedResults = readingOrderProcessor.process(
    recognitionResults,
    pageBlocks,
  );
  const plainText = orderedResults
    .filter((block) => block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();

  const confidence =
    recognitionResults.length > 0
      ? recognitionResults.reduce((sum, block) => sum + block.confidence, 0) /
        recognitionResults.length
      : 0;

  return { plainText, confidence };
}
