import "@/styles/globals.css";

import { GeistSans } from "geist/font/sans";

import { TRPCReactProvider } from "@/trpc/react";
import NextAuthProvider from "@/providers/next-auth";
import { Header } from "./_components/header/header";
import { Analytics } from "@vercel/analytics/react";
import { SPGuardProvider } from "@/providers/sp-guard";

export const metadata = {
  title: "ArsTraverse",
  description: "関係性の宇宙を横断する可視化ツール",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} bg-slate-900`}>
      <Analytics />
      <body>
        <TRPCReactProvider>
          <NextAuthProvider>
            <div className="fixed top-0 w-full">
              <Header />
            </div>

            <SPGuardProvider>{children}</SPGuardProvider>
          </NextAuthProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
