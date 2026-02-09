/**
 * SVG 要素を Canvas にラスタライズするユーティリティ。
 * ダブルバッファリングで毎フレームの非同期変換を高速化する。
 */

/** SVG を data URL に変換（XMLSerializer + Blob URL） */
function svgToDataUrl(svgElement: SVGSVGElement): string {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
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

  function renderFrame(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 前回の Blob URL を解放
      if (lastBlobUrl) {
        URL.revokeObjectURL(lastBlobUrl);
      }

      const dataUrl = svgToDataUrl(svgElement);
      lastBlobUrl = dataUrl;

      const img = images[currentImageIndex]!;
      currentImageIndex = (currentImageIndex + 1) % 2;

      img.onload = () => {
        // 背景を塗る
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
        // SVG を描画
        ctx.drawImage(img, 0, 0, width, height);
        resolve();
      };
      img.onerror = () => {
        reject(new Error("SVG を Image にロードできませんでした"));
      };
      img.src = dataUrl;
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
