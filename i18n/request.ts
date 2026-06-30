import { getRequestConfig } from "next-intl/server";

import { routing, type Locale } from "./routing";

export const locales = routing.locales;
export type { Locale };
export const defaultLocale = routing.defaultLocale;

export function isValidLocale(locale: string): locale is Locale {
  return routing.locales.includes(locale as Locale);
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !isValidLocale(locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Asia/Tokyo",
    now: new Date(),
  };
});
