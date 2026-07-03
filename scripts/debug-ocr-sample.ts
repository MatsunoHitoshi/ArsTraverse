import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfTextFromBuffer } from "@/server/lib/pdf/extract-pdf-text";
import { rasterizePdfPages } from "@/server/lib/pdf/rasterize-pdf-pages";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const pdfPath =
    process.argv[2] ??
    path.join(__dirname, "../inner-docs/ocr/tarl_output_02-1のコピー.pdf");
  const pageNum = Number(process.argv[3] ?? "1");
  const maxPages = Number(process.argv[4] ?? "1");

  const buf = fs.readFileSync(pdfPath);
  const raster = await rasterizePdfPages(buf, {
    startPage: pageNum,
    maxPages: 1,
    scale: 2.5,
  });
  console.log(
    "rasterized",
    raster.pages[0]?.width,
    "x",
    raster.pages[0]?.height,
    "pages",
    raster.pageCount,
  );

  const extracted = await extractPdfTextFromBuffer(buf, {
    processOcr: true,
    forceOcr: true,
    forceOcrLanguage: "jpn_vert",
    startPage: pageNum,
    maxPages,
  });
  console.log("method", extracted.method, "len", extracted.plainText.length);
  console.log(extracted.plainText.slice(0, 2000));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
