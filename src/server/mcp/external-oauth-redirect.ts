import { env } from "@/env";

export function getAllowedExternalOAuthRedirectUris(): string[] {
  const raw = env.EXTERNAL_OAUTH_REDIRECT_URIS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((uri) => uri.trim())
    .filter(Boolean);
}

function normalizeRedirectUri(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function validateExternalOAuthRedirectUri(redirectUri: string): boolean {
  const normalized = normalizeRedirectUri(redirectUri);
  if (!normalized) return false;

  const allowed = getAllowedExternalOAuthRedirectUris();
  if (allowed.length === 0) return false;

  return allowed.some((candidate) => {
    const normalizedCandidate = normalizeRedirectUri(candidate);
    return normalizedCandidate === normalized;
  });
}

export function buildExternalOAuthRedirectUrl(input: {
  redirectUri: string;
  token: string;
  expiresAt: string;
  state?: string;
}): string {
  const url = new URL(input.redirectUri);
  url.searchParams.set("token", input.token);
  url.searchParams.set("expires_at", input.expiresAt);
  if (input.state) {
    url.searchParams.set("state", input.state);
  }
  return url.toString();
}
