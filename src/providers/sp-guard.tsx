"use client";
import { LinkButton } from "@/app/_components/button/link-button";
import { UrlCopy } from "@/app/_components/url-copy/url-copy";
import { spAllowed } from "@/app/const/page-config";
import { usePathname } from "next/navigation";

export const SPGuardProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pagePath = usePathname();

  const isSpAllowed = spAllowed(pagePath);

  return (
    <>
      {!isSpAllowed && (
        <div className="flex flex-col gap-8 px-4 pt-12 sm:hidden">
          <div className="flex flex-col items-center justify-center gap-4 pt-[120px] text-center text-white">
            <p className="text-xl font-semibold">
              このページはスマートフォンの
              <br />
              画面サイズに対応していません
            </p>
            <p className="text-sm text-slate-300">
              PC・タブレットでご利用いただくか、
              <br />
              スマートフォン向けのフィールドリサーチをご利用ください。
            </p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <LinkButton
              href="/field"
              className="w-full max-w-xs bg-orange-400 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-orange-500"
            >
              フィールドリサーチへ
            </LinkButton>
            <UrlCopy className="text-sm">
              このページのURLをコピーする（PCで開く）
            </UrlCopy>
          </div>
        </div>
      )}
      <div className={!isSpAllowed ? "hidden w-full sm:block" : "block w-full"}>
        {children}
      </div>
    </>
  );
};
