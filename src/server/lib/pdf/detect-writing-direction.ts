import type { LayoutDetectionResult } from "@/features/field/ocr/ndlocr/types/ocr";
import type {
  OcrLanguage,
  WritingDirection,
} from "@/server/lib/pdf-extraction/types";

const VERTICAL_ASPECT_THRESHOLD = 2.5;
const HORIZONTAL_ASPECT_THRESHOLD = 2.5;

export type WritingDirectionDetection = {
  direction: WritingDirection;
  confidence: number;
  suggestedOcrLanguage: OcrLanguage;
};

function classifyLineRegions(
  layout: LayoutDetectionResult,
): WritingDirectionDetection {
  const lines = layout.lines;
  if (lines.length === 0) {
    return {
      direction: "unknown",
      confidence: 0,
      suggestedOcrLanguage: "jpn",
    };
  }

  let verticalCount = 0;
  let horizontalCount = 0;

  for (const line of lines) {
    const aspect = line.height / Math.max(line.width, 1);
    if (aspect >= VERTICAL_ASPECT_THRESHOLD) {
      verticalCount += 1;
    } else if (line.width / Math.max(line.height, 1) >= HORIZONTAL_ASPECT_THRESHOLD) {
      horizontalCount += 1;
    }
  }

  const total = lines.length;
  const verticalRate = verticalCount / total;
  const horizontalRate = horizontalCount / total;

  if (verticalRate >= 0.7) {
    return {
      direction: "vertical",
      confidence: verticalRate,
      suggestedOcrLanguage: "jpn_vert",
    };
  }

  if (horizontalRate >= 0.7) {
    return {
      direction: "horizontal",
      confidence: horizontalRate,
      suggestedOcrLanguage: "jpn",
    };
  }

  if (verticalRate > horizontalRate && verticalRate >= 0.4) {
    return {
      direction: "mixed",
      confidence: verticalRate,
      suggestedOcrLanguage: "jpn_vert",
    };
  }

  if (horizontalRate > verticalRate && horizontalRate >= 0.4) {
    return {
      direction: "mixed",
      confidence: horizontalRate,
      suggestedOcrLanguage: "jpn",
    };
  }

  return {
    direction: "unknown",
    confidence: Math.max(verticalRate, horizontalRate),
    suggestedOcrLanguage: "jpn",
  };
}

export function detectWritingDirectionFromLayout(
  layout: LayoutDetectionResult,
): WritingDirectionDetection {
  return classifyLineRegions(layout);
}

export function resolveOcrLanguage(input: {
  detection: WritingDirectionDetection;
  defaultOcrLanguage: OcrLanguage;
}): {
  language: OcrLanguage;
  directionSource: "auto" | "topic_space_default" | "manual";
  writingDirection: WritingDirection;
  directionConfidence: number;
} {
  if (input.detection.confidence >= 0.6) {
    return {
      language: input.detection.suggestedOcrLanguage,
      directionSource: "auto",
      writingDirection: input.detection.direction,
      directionConfidence: input.detection.confidence,
    };
  }

  return {
    language: input.defaultOcrLanguage,
    directionSource: "topic_space_default",
    writingDirection:
      input.defaultOcrLanguage === "jpn_vert" ? "vertical" : "horizontal",
    directionConfidence: input.detection.confidence,
  };
}
