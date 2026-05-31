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
  if (!locale || !isValidLocale(locale)) {
    notFound();
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Asia/Tokyo",
    now: new Date(),
  };
});
