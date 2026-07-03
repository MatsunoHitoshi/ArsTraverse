import type { PdfTextQuality } from "@/server/lib/pdf-extraction/types";

const MEANINGFUL_CHAR_RE =
  /[\u3040-\u30ff\u3400-\u9fff\u4e00-\u9faf\uff66-\uff9fa-zA-Z0-9]/g;
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000e-\u001f\u007f]/g;
const REPEATED_CHAR_RE = /(.)\1{5,}/g;

function ratio(count: number, total: number): number {
  if (total <= 0) return 0;
  return count / total;
}

export function assessPdfTextQuality(
  text: string,
  pageCount: number,
): PdfTextQuality {
  const trimmed = text.trim();
  const reasons: string[] = [];

  if (!trimmed) {
    return { score: 0, needsOcr: true, reasons: ["empty_text"] };
  }

  const chars = [...trimmed];
  const charCount = chars.length;
  const lines = trimmed.split(/\n+/).filter((line) => line.trim().length > 0);
  const singleCharLines = lines.filter((line) => line.trim().length === 1);
  const singleCharLineRate = ratio(singleCharLines.length, lines.length);

  const meaningfulMatches = trimmed.match(MEANINGFUL_CHAR_RE) ?? [];
  const meaningfulRatio = ratio(meaningfulMatches.length, charCount);

  const controlMatches = trimmed.match(CONTROL_CHAR_RE) ?? [];
  const controlRatio = ratio(controlMatches.length, charCount);

  const repeatedMatches = trimmed.match(REPEATED_CHAR_RE) ?? [];
  const repeatedRatio = ratio(
    repeatedMatches.reduce((sum, match) => sum + match.length, 0),
    charCount,
  );

  const effectivePages = Math.max(pageCount, 1);
  const charsPerPage = charCount / effectivePages;

  let score = 1;

  if (charsPerPage < 50) {
    reasons.push("low_chars_per_page");
    score -= 0.35;
  }

  if (singleCharLineRate > 0.4) {
    reasons.push("high_single_char_line_rate");
    score -= 0.35;
  }

  if (meaningfulRatio < 0.3) {
    reasons.push("low_meaningful_char_ratio");
    score -= 0.35;
  }

  if (controlRatio > 0.05) {
    reasons.push("high_control_char_ratio");
    score -= 0.25;
  }

  if (repeatedRatio > 0.1) {
    reasons.push("high_repeated_char_ratio");
    score -= 0.2;
  }

  score = Math.max(0, Math.min(1, score));

  const highConfidenceSignals = reasons.filter((reason) =>
    [
      "empty_text",
      "high_single_char_line_rate",
      "low_meaningful_char_ratio",
      "low_chars_per_page",
    ].includes(reason),
  ).length;

  const needsOcr =
    score < 0.5 || highConfidenceSignals >= 2 || !trimmed;

  return { score, needsOcr, reasons };
}
