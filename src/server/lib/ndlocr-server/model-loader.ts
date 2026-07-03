import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MODEL_VERSION = "2.0.0";

const R2_BASE =
  process.env.NDL_OCR_MODEL_UPSTREAM_URL ??
  "https://pub-9cac8877191a4c3697edb59fd982130f.r2.dev";

const MODEL_FILES: Record<string, string> = {
  layout: "deim-s-1024x1024.onnx",
  recognition30:
    "parseq-ndl-24x256-30-tiny-189epoch-tegaki3-r8data-202604.onnx",
  recognition50:
    "parseq-ndl-24x384-50-tiny-300epoch-tegaki3-r8data-202604.onnx",
  recognition100:
    "parseq-ndl-24x768-100-tiny-153epoch-tegaki3-r8data-202604.onnx",
};

function getCacheDir(): string {
  return path.join(process.cwd(), ".cache", "ndlocr-models");
}

async function readCachedModel(modelType: string): Promise<ArrayBuffer | null> {
  const cachePath = path.join(getCacheDir(), `${modelType}.onnx`);
  const metaPath = path.join(getCacheDir(), `${modelType}.json`);
  try {
    const [modelBuffer, metaRaw] = await Promise.all([
      readFile(cachePath),
      readFile(metaPath, "utf8"),
    ]);
    const meta = JSON.parse(metaRaw) as { version?: string };
    if (meta.version !== MODEL_VERSION) return null;
    return modelBuffer.buffer.slice(
      modelBuffer.byteOffset,
      modelBuffer.byteOffset + modelBuffer.byteLength,
    );
  } catch {
    return null;
  }
}

async function writeCachedModel(
  modelType: string,
  data: ArrayBuffer,
): Promise<void> {
  const cacheDir = getCacheDir();
  await mkdir(cacheDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(cacheDir, `${modelType}.onnx`), Buffer.from(data)),
    writeFile(
      path.join(cacheDir, `${modelType}.json`),
      JSON.stringify({ version: MODEL_VERSION, cachedAt: Date.now() }),
      "utf8",
    ),
  ]);
}

export async function loadNdlOcrModel(modelType: string): Promise<ArrayBuffer> {
  const fileName = MODEL_FILES[modelType];
  if (!fileName) {
    throw new Error(`Unknown NDLOCR model type: ${modelType}`);
  }

  const cached = await readCachedModel(modelType);
  if (cached) return cached;

  const response = await fetch(`${R2_BASE}/${fileName}`);
  if (!response.ok) {
    throw new Error(
      `Failed to download NDLOCR model ${modelType}: ${response.status}`,
    );
  }

  const data = await response.arrayBuffer();
  await writeCachedModel(modelType, data);
  return data;
}
