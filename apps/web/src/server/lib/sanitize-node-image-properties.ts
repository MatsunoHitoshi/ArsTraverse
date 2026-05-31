import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const IMAGE_URL_MAX_LENGTH = 2048;
const IMAGE_CAPTION_MAX_LENGTH = 1000;
const IMAGE_ALT_MAX_LENGTH = 500;

const urlSchema = z.string().url().max(IMAGE_URL_MAX_LENGTH);

/**
 * Sanitizes node properties for image-related keys (imageUrl, imageCaption, imageAlt).
 * Used before persisting GraphNode.properties in updateGraphProperties and documentGraph.updateGraph.
 * - imageUrl: must be valid URL, max 2048 chars; empty string removes the key
 * - imageCaption / imageAlt: string, truncated to max length
 * - other properties: preserved as-is (not stringified)
 * @throws TRPCError when imageUrl is non-empty and invalid
 */
export function sanitizeNodeImageProperties(
  properties: Record<string, unknown>,
): Record<string, Prisma.InputJsonValue> {
  const result: Record<string, Prisma.InputJsonValue> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (key === "imageUrl") {
      const trimmed = String(value).trim();
      if (trimmed === "") {
        continue;
      }
      const parsed = urlSchema.safeParse(trimmed);
      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "imageUrl must be a valid URL and at most 2048 characters",
        });
      }
      result[key] = parsed.data;
      continue;
    }

    if (key === "imageCaption") {
      result[key] = String(value).slice(0, IMAGE_CAPTION_MAX_LENGTH);
      continue;
    }

    if (key === "imageAlt") {
      result[key] = String(value).slice(0, IMAGE_ALT_MAX_LENGTH);
      continue;
    }

    // Since input properties are unknown, we assume they are valid JSON values
    // if they came from the database or valid JSON input.
    result[key] = value as Prisma.InputJsonValue;
  }

  return result;
}
