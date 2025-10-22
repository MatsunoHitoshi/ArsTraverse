import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "./i18n/request";

export default createMiddleware({
  locales,
  defaultLocale,
  localeDetection: true,
});

export const config = {
  matcher: [
    // すべてのパスをマッチ（静的ファイルとAPIルートは除外）
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
