/**
 * Embedding Cron のアイドル判定。
 *
 * Vercel 側で Edge Function を呼ぶ前に、未処理が1件でもあるかを PostgREST で見る。
 * サービスロールが無い、または問い合わせに失敗したときは unknown を返し、
 * 呼び出し元は従来どおり Edge Function にフォールバックする（仕事の取りこぼしを避ける）。
 */

export const NODE_NAME_EMBEDDING_IDLE_MESSAGE =
  "No nodes found or all nodes already have embeddings";

export const TRANS_E_EMBEDDING_IDLE_MESSAGE = "No jobs to process";

const PROBE_TIMEOUT_MS = 5_000;

export type EmbeddingIdleProbe = "idle" | "work" | "unknown";

export function buildNodeNameEmbeddingProbeUrl(supabaseUrl: string): string {
  const url = new URL("/rest/v1/GraphNode", supabaseUrl);
  url.searchParams.set("select", "id");
  url.searchParams.set("nameEmbedding", "is.null");
  url.searchParams.set("limit", "1");
  return url.toString();
}

export function buildTransEEmbeddingProbeUrl(supabaseUrl: string): string {
  const url = new URL("/rest/v1/GraphEmbeddingQueue", supabaseUrl);
  // `in.(...)` は PostgREST の演算子なので括弧をエンコードしない。
  url.search = "select=id&status=in.(PENDING,PROCESSING)&limit=1";
  return url.toString();
}

export function interpretProbeRows(body: unknown): EmbeddingIdleProbe {
  if (!Array.isArray(body)) return "unknown";
  return body.length > 0 ? "work" : "idle";
}

async function probeHasRow(probeUrl: string): Promise<EmbeddingIdleProbe> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !key) {
    return "unknown";
  }

  try {
    const res = await fetch(probeUrl, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("Embedding idle probe failed:", res.status);
      return "unknown";
    }
    const body: unknown = await res.json();
    return interpretProbeRows(body);
  } catch (error) {
    console.warn("Embedding idle probe error:", error);
    return "unknown";
  }
}

function supabaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return url ? url : null;
}

export function probeNodeNameEmbeddingWork(): Promise<EmbeddingIdleProbe> {
  const url = supabaseUrl();
  if (!url) return Promise.resolve("unknown");
  return probeHasRow(buildNodeNameEmbeddingProbeUrl(url));
}

export function probeTransEEmbeddingWork(): Promise<EmbeddingIdleProbe> {
  const url = supabaseUrl();
  if (!url) return Promise.resolve("unknown");
  return probeHasRow(buildTransEEmbeddingProbeUrl(url));
}
