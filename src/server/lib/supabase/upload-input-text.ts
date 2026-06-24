import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createId } from "@/app/_utils/cuid/cuid";
import { BUCKETS } from "@/app/_utils/supabase/const";
import { env } from "@/env";

function isLocalSupabaseUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

function readLocalServiceRoleKeyFromCli(): string | null {
  try {
    const raw = execSync("supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const status = JSON.parse(raw) as { SERVICE_ROLE_KEY?: string };
    return status.SERVICE_ROLE_KEY?.trim() ?? null;
  } catch {
    return null;
  }
}

let cachedServiceRoleKey: string | null = null;

function resolveServiceRoleKey(): string {
  if (cachedServiceRoleKey) {
    return cachedServiceRoleKey;
  }

  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fromEnv) {
    cachedServiceRoleKey = fromEnv;
    return fromEnv;
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (isLocalSupabaseUrl(supabaseUrl)) {
    const fromCli = readLocalServiceRoleKeyFromCli();
    if (fromCli) {
      cachedServiceRoleKey = fromCli;
      return fromCli;
    }
  }

  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY が未設定です。MCP からのプレーンテキスト Storage アップロードに必要です。",
  );
}

/**
 * サーバー側から input-txt バケットへプレーンテキストをアップロードする。
 * GUI の document-form と同じバケット・公開 URL 形式を返す。
 */
export async function uploadPlainTextToInputTxt(
  plainText: string,
): Promise<string> {
  const serviceRoleKey = resolveServiceRoleKey();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const objectKey = createId();
  const blob = new Blob([plainText], {
    type: "text/plain; charset=utf-8",
  });

  const { data, error } = await admin.storage
    .from(BUCKETS.PATH_TO_INPUT_TXT)
    .upload(objectKey, blob, {
      contentType: "text/plain; charset=utf-8",
    });

  if (error ?? !data?.path) {
    throw new Error(
      `プレーンテキストの Storage アップロードに失敗しました: ${error?.message ?? "unknown error"}`,
    );
  }

  const { data: uploaded } = admin.storage
    .from(BUCKETS.PATH_TO_INPUT_TXT)
    .getPublicUrl(data.path);

  if (!uploaded.publicUrl) {
    throw new Error("アップロード後の公開 URL を取得できませんでした");
  }

  return uploaded.publicUrl;
}
