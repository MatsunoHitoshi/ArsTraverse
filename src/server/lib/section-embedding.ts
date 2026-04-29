import { InferenceClient } from "@huggingface/inference";
import { env } from "@/env";

const MINI_LM_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
const MAX_SECTION_CHARS = 8000;

function toNumberArray2D(
  raw: unknown,
  expectedDim: number,
): number[][] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    if (typeof raw[0] === "number") {
      const row = raw as number[];
      return row.length === expectedDim || expectedDim === 0 ? [row] : null;
    }
    const rows: number[][] = [];
    for (const item of raw) {
      if (!Array.isArray(item)) return null;
      const r = item.map((x) => Number(x));
      if (r.some((n) => Number.isNaN(n))) return null;
      rows.push(r);
    }
    return rows;
  }
  return null;
}

function toNumberArray1D(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw) && typeof raw[0] === "number") {
    const r = (raw as number[]).map((x) => Number(x));
    return r.some((n) => Number.isNaN(n)) ? null : r;
  }
  return null;
}

/**
 * 各セクションのプレーンテキストを MiniLM（384 次元）で埋め込む。
 * バッチ対応: HF が配列を受け付ける場合は 1 リクエスト、そうでなければ逐次。
 */
export async function embedSectionTextsMiniL6(
  texts: string[],
): Promise<number[][]> {
  const trimmed = texts.map((t) => t.slice(0, MAX_SECTION_CHARS));
  const hf = new InferenceClient(env.HUGGINGFACE_API_KEY);

  const first = await hf.featureExtraction({
    model: MINI_LM_MODEL,
    inputs: trimmed.length === 1 ? trimmed[0]! : trimmed,
  });

  const asAny = first as unknown;
  const batched = toNumberArray2D(asAny, 0);
  if (batched && batched.length === trimmed.length) {
    return batched;
  }
  const singleFromBatch = toNumberArray1D(asAny);
  if (singleFromBatch && trimmed.length === 1) {
    return [singleFromBatch];
  }

  const out: number[][] = [];
  for (const t of trimmed) {
    const one = await hf.featureExtraction({
      model: MINI_LM_MODEL,
      inputs: t,
    });
    const vec = toNumberArray1D(one as unknown);
    if (!vec) throw new Error("section-embedding: failed to parse vector");
    out.push(vec);
  }
  return out;
}
