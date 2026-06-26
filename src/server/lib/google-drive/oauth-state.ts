import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_DRIVE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";

type OAuthStatePayload = {
  userId: string;
  returnTo: string;
  nonce: string;
};

function getStateSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET が未設定です");
  }
  return secret;
}

export function signGoogleDriveOAuthState(input: {
  userId: string;
  returnTo: string;
}): string {
  const payload: OAuthStatePayload = {
    userId: input.userId,
    returnTo: input.returnTo,
    nonce: randomBytes(16).toString("hex"),
  };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", getStateSecret())
    .update(body)
    .digest("hex");
  return Buffer.from(JSON.stringify({ body, signature })).toString("base64url");
}

export function verifyGoogleDriveOAuthState(state: string): {
  userId: string;
  returnTo: string;
} {
  let parsed: { body?: string; signature?: string };
  try {
    parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { body?: string; signature?: string };
  } catch {
    throw new Error("無効な OAuth state です");
  }

  if (!parsed.body || !parsed.signature) {
    throw new Error("無効な OAuth state です");
  }

  const expected = createHmac("sha256", getStateSecret())
    .update(parsed.body)
    .digest("hex");

  const actualBuffer = Buffer.from(parsed.signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("OAuth state の署名が一致しません");
  }

  const payload = JSON.parse(parsed.body) as OAuthStatePayload;
  if (!payload.userId || !payload.returnTo) {
    throw new Error("OAuth state の内容が不正です");
  }

  return { userId: payload.userId, returnTo: payload.returnTo };
}

export function sanitizeReturnTo(returnTo: string | null): string {
  if (!returnTo?.startsWith("/")) {
    return "/topic-spaces";
  }
  if (returnTo.startsWith("//")) {
    return "/topic-spaces";
  }
  return returnTo;
}
