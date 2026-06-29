"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { useSession } from "next-auth/react";

import { api } from "@/trpc/react";
import { usePathname, useRouter } from "i18n/navigation";
import type { Locale } from "i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("account");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isPending, startTransition] = useTransition();
  const updateUiLocale = api.user.updateUiLocale.useMutation();

  const switchLocale = (nextLocale: Locale) => {
    if (nextLocale === locale) return;

    startTransition(() => {
      if (session?.user) {
        updateUiLocale.mutate({ locale: nextLocale });
      }
      router.replace(pathname, { locale: nextLocale });
    });
  };

  return (
    <div className="flex items-center gap-1 rounded-md bg-slate-800/60 p-0.5 text-xs">
      <button
        type="button"
        onClick={() => switchLocale("ja")}
        disabled={isPending}
        className={`rounded px-2 py-1 transition-colors ${
          locale === "ja"
            ? "bg-slate-600 text-slate-50"
            : "text-slate-300 hover:text-slate-50"
        }`}
        aria-label={t("languageJa")}
      >
        JA
      </button>
      <button
        type="button"
        onClick={() => switchLocale("en")}
        disabled={isPending}
        className={`rounded px-2 py-1 transition-colors ${
          locale === "en"
            ? "bg-slate-600 text-slate-50"
            : "text-slate-300 hover:text-slate-50"
        }`}
        aria-label={t("languageEn")}
      >
        EN
      </button>
    </div>
  );
}
