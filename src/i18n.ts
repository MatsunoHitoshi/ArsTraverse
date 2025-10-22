import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";

// サポートする言語のリスト
export const locales = ["ja", "en"] as const;
export type Locale = (typeof locales)[number];

// デフォルト言語
export const defaultLocale: Locale = "ja";

// ロケール検証関数
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

// next-intlの設定
export default getRequestConfig(async ({ locale }) => {
  // ロケールが有効でない場合は404を返す
  if (locale && !isValidLocale(locale)) notFound();

  const validLocale = locale ?? defaultLocale;
  const messagesModule = (await import(`../messages/${validLocale}.json`)) as {
    default: Record<string, unknown>;
  };

  return {
    locale: validLocale,
    messages: messagesModule.default,
    timeZone: "Asia/Tokyo",
    now: new Date(),
  };
});
