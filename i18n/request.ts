import { getRequestConfig } from "next-intl/server";

import enMessages from "../messages/en.json";
import jaMessages from "../messages/ja.json";
import { routing, type Locale } from "./routing";

export const locales = routing.locales;
export type { Locale };
export const defaultLocale = routing.defaultLocale;

const messagesByLocale = {
  ja: jaMessages,
  en: enMessages,
} as const satisfies Record<Locale, typeof jaMessages>;

export function isValidLocale(locale: string): locale is Locale {
  return routing.locales.includes(locale as Locale);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale =
    requested && isValidLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: messagesByLocale[locale],
    timeZone: "Asia/Tokyo",
    now: new Date(),
  };
});
