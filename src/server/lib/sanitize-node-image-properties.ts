import { TRPCError } from "@trpc/server";
import { z } from "zod";

const IMAGE_URL_MAX_LENGTH = 2048;
const IMAGE_CAPTION_MAX_LENGTH = 1000;
const IMAGE_ALT_MAX_LENGTH = 500;

const urlSchema = z.string().url().max(IMAGE_URL_MAX_LENGTH);

/**
 * Sanitizes node properties for image-related keys (imageUrl, imageCaption, imageAlt).
 * Used before persisting GraphNode.properties in updateGraphProperties and documentGraph.updateGraph.
 * - imageUrl: must be valid URL, max 2048 chars; empty string removes the key
 * - imageCaption / imageAlt: string, truncated to max length
 * @throws TRPCError when imageUrl is non-empty and invalid
 */
export function sanitizeNodeImageProperties(
  properties: Record<string, unknown>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) {
      continue;
    }
    const str = typeof value === "string" ? value : String(value);

    if (key === "imageUrl") {
      const trimmed = str.trim();
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
      result[key] = str.slice(0, IMAGE_CAPTION_MAX_LENGTH);
      continue;
    }

    if (key === "imageAlt") {
      result[key] = str.slice(0, IMAGE_ALT_MAX_LENGTH);
      continue;
    }

    result[key] = str;
  }

  return result;
}
