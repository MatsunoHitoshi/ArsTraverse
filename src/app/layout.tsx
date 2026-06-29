import "@/styles/globals.css";

import { GeistSans } from "geist/font/sans";

import { defaultLocale } from "i18n/request";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang={defaultLocale} className={`${GeistSans.variable} bg-slate-900`}>
      <body>{children}</body>
    </html>
  );
}
