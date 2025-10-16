import "@/styles/globals.css";

import { GeistSans } from "geist/font/sans";

import { TRPCReactProvider } from "@/trpc/react";
import NextAuthProvider from "@/providers/next-auth";
import { Header } from "./_components/header/header";
import { Analytics } from "@vercel/analytics/react";
import { SPGuardProvider } from "@/providers/sp-guard";

export const metadata = {
  title: "ArsTraverse",
  description: "関係性の宇宙を横断する可視化アーカイブツール",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} bg-white dark:bg-slate-900`}
    >
      <Analytics />
      <body className="text-slate-900 dark:text-white">
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
      </body>
    </html>
  );
}
