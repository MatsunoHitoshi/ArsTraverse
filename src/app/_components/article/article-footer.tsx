"use client";

import { Link } from "i18n/navigation";
import { useTranslations } from "next-intl";

export const ArticleFooter = () => {
  const t = useTranslations("article");

  return (
    <footer className="bg-background border-t px-8">
      <div className="flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
        <div className="flex flex-row items-center gap-4">
          <Link
            href={"/articles"}
            className="text-sm underline hover:no-underline"
            rel="noopener noreferrer"
          >
            {t("backToArticles")}
          </Link>
          <Link
            href={"/"}
            className="text-sm underline hover:no-underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("goToTool")}
          </Link>
        </div>
        <div className="text-muted-foreground text-center text-sm leading-loose md:text-left">
          © {new Date().getFullYear()} CariC. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
