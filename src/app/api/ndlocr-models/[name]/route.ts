import { NextResponse } from "next/server";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const fileName = MODEL_FILES[name];

  if (!fileName) {
    return NextResponse.json({ error: "Unknown model" }, { status: 404 });
  }

  const upstream = await fetch(`${R2_BASE}/${fileName}`);

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream error: ${upstream.status}` },
      { status: upstream.status },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/octet-stream");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
