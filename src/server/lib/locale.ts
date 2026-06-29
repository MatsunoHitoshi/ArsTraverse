import type { Locale } from "i18n/routing";

export function resolveLocaleFromHeaders(headers: Headers): Locale {
  const headerLocale = headers.get("x-locale");
  if (headerLocale === "ja" || headerLocale === "en") {
    return headerLocale;
  }

  const acceptLanguage = headers.get("accept-language");
  if (acceptLanguage) {
    const preferred = acceptLanguage
      .split(",")
      .map((part) => part.split(";")[0]?.trim().toLowerCase() ?? "")
      .filter(Boolean);

    for (const lang of preferred) {
      if (lang.startsWith("en")) return "en";
      if (lang.startsWith("ja")) return "ja";
    }
  }

  return "ja";
}
