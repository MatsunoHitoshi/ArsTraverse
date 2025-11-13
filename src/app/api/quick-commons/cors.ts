import { NextResponse } from "next/server";
import { env } from "@/env";

/**
 * CORSヘッダーを設定したレスポンスを作成
 */
export function createCorsResponse(
  response: NextResponse,
  origin?: string | null,
): NextResponse {
  // 許可するオリジン（環境変数で設定可能、デフォルトはすべて許可）
  const allowedOrigin = env.QUICK_COMMONS_ALLOWED_ORIGIN ?? "*";

  // リクエストのOriginを確認
  const requestOrigin = origin ?? allowedOrigin;

  // CORSヘッダーを設定
  response.headers.set(
    "Access-Control-Allow-Origin",
    allowedOrigin === "*" ? "*" : (requestOrigin ?? "*"),
  );
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}

/**
 * OPTIONSリクエスト用のCORSレスポンスを作成
 */
export function createCorsOptionsResponse(origin?: string | null) {
  const response = new NextResponse(null, { status: 204 });
  return createCorsResponse(response, origin);
}
