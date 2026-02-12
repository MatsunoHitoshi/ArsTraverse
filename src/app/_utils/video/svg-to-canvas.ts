/**
 * SVG 要素を Canvas にラスタライズするユーティリティ。
 * ダブルバッファリングで毎フレームの非同期変換を高速化する。
 *
 * ノード画像（<image href="外部URL">）はシリアライズ時に data URL へ埋め込む。
 * これにより、Blob URL 経由で SVG を Image に読み込んでも、ネストされた画像の
 * 非同期読み込みを待たずに正しくレンダリングされる。
 */

/** 外部画像 URL を data URL に変換する。失敗時は null を返す */
async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** 相対 URL を絶対 URL に解決する */
function resolveUrl(href: string): string {
  if (
    href.startsWith("data:") ||
    href.startsWith("blob:") ||
    href.startsWith("http")
  ) {
    return href;
  }
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return href;
  }
}

/** 外部URLかどうか（fetch対象か） */
function needsFetch(url: string): boolean {
  return url.startsWith("http") || url.startsWith("blob:");
}

/**
 * SVG 内の外部画像 href を data URL に置換したクローンを作成する。
 * - 対策2: 画像がない／全て data URL の場合は fetch をスキップして早期リターン
 * - 対策1: cache に登録済みの URL は fetch せずキャッシュから取得
 */
async function embedSvgImagesAsDataUrls(
  svgElement: SVGSVGElement,
  cache: Map<string, string>,
): Promise<SVGSVGElement> {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  const images = clone.querySelectorAll("image");

  // 対策2: 埋め込み対象の画像があるか事前チェック
  const toFetch: { img: SVGImageElement; resolvedUrl: string }[] = [];
  images.forEach((img) => {
    const href =
      img.getAttribute("href") ?? img.getAttribute("xlink:href") ?? "";
    if (!href || href.startsWith("data:")) return;

    const resolvedUrl = resolveUrl(href);
    if (!needsFetch(resolvedUrl)) return;

    toFetch.push({ img, resolvedUrl });
  });

  if (toFetch.length === 0) {
    return clone;
  }

  const promises: Promise<void>[] = [];
  toFetch.forEach(({ img, resolvedUrl }) => {
    const p = (async () => {
      let dataUrl = cache.get(resolvedUrl);
      if (!dataUrl) {
        dataUrl = (await fetchAsDataUrl(resolvedUrl)) ?? "";
        if (dataUrl) cache.set(resolvedUrl, dataUrl);
      }
      if (dataUrl) {
        img.setAttribute("href", dataUrl);
        img.removeAttribute("xlink:href");
      }
    })();
    promises.push(p);
  });

  await Promise.all(promises);
  return clone;
}

/** SVG を Blob URL に変換（外部画像を data URL 埋め込み済み） */
async function svgToBlobUrl(
  svgElement: SVGSVGElement,
  cache: Map<string, string>,
): Promise<string> {
  const svgWithEmbeddedImages = await embedSvgImagesAsDataUrls(
    svgElement,
    cache,
  );
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgWithEmbeddedImages);
  const blob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  return URL.createObjectURL(blob);
}

export interface SvgToCanvasRenderer {
  /** SVG の現在の状態を Canvas に描画する。Promise は描画完了時に解決される */
  renderFrame(): Promise<void>;
  /** リソースを解放する */
  dispose(): void;
  /** 内部の Canvas 要素を返す */
  getCanvas(): HTMLCanvasElement;
}

/**
 * SvgToCanvasRenderer を作成する。
 * width/height は出力解像度。background は背景色（例: "#0F172A"）。
 */
export function createSvgToCanvasRenderer(
  svgElement: SVGSVGElement,
  width: number,
  height: number,
  background: string,
): SvgToCanvasRenderer {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // ダブルバッファリング用の Image 2 つ
  const images: [HTMLImageElement, HTMLImageElement] = [
    new Image(),
    new Image(),
  ];
  let currentImageIndex = 0;
  let lastBlobUrl: string | null = null;

  /** 対策1: URL→data URL のキャッシュ（録画セッション全体で再利用） */
  const imageUrlCache = new Map<string, string>();

  async function renderFrame(): Promise<void> {
    // 前回の Blob URL を解放
    if (lastBlobUrl) {
      URL.revokeObjectURL(lastBlobUrl);
      lastBlobUrl = null;
    }

    const blobUrl = await svgToBlobUrl(svgElement, imageUrlCache);
    lastBlobUrl = blobUrl;

    const img = images[currentImageIndex]!;
    currentImageIndex = (currentImageIndex + 1) % 2;

    return new Promise((resolve, reject) => {
      img.onload = () => {
        // 背景を塗る
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
        // SVG を描画（埋め込み済みのためネスト画像も含まれる）
        ctx.drawImage(img, 0, 0, width, height);
        resolve();
      };
      img.onerror = () => {
        reject(new Error("SVG を Image にロードできませんでした"));
      };
      img.src = blobUrl;
    });
  }

  function dispose() {
    if (lastBlobUrl) {
      URL.revokeObjectURL(lastBlobUrl);
      lastBlobUrl = null;
    }
    images[0].src = "";
    images[1].src = "";
  }

  function getCanvas() {
    return canvas;
  }

  return { renderFrame, dispose, getCanvas };
}
