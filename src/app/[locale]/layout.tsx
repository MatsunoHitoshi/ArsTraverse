import { Analytics } from "@vercel/analytics/react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Header } from "@/app/_components/header/header";
import { SetHtmlLang } from "@/app/_components/i18n/set-html-lang";
import NextAuthProvider from "@/providers/next-auth";
import { SPGuardProvider } from "@/providers/sp-guard";
import { TRPCReactProvider } from "@/trpc/react";
import { routing } from "i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const descriptions: Record<string, string> = {
    ja: "関係性の宇宙を横断する可視化アーカイブツール",
    en: "A visualization archive tool for traversing relational universes",
  };

  return {
    title: "ArsTraverse",
    description: descriptions[locale] ?? descriptions.ja,
    icons: [{ rel: "icon", url: "/favicon.ico" }],
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <SetHtmlLang locale={locale} />
      <Analytics />
      <TRPCReactProvider>
        <NextAuthProvider>
          <div className="fixed top-0 z-20 w-full">
            <Header />
          </div>
          <div className="z-0">
            <SPGuardProvider>{children}</SPGuardProvider>
          </div>
        </NextAuthProvider>
      </TRPCReactProvider>
    </NextIntlClientProvider>
  );
}
