"use client";
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
        <div className="flex flex-col gap-8 pt-12 sm:hidden">
          <div className="flex flex-row items-center justify-center pt-[200px] text-center text-xl font-semibold text-white">
            このアプリはスマートフォンの
            <br />
            画面サイズに対応していません😖
            <br />
            <br />
            PC・タブレットにてご利用ください🙇‍♂️
          </div>
          <div className="flex flex-row justify-center">
            <UrlCopy>このページのURLをコピーする</UrlCopy>
          </div>
        </div>
      )}
      <div className={!isSpAllowed ? "hidden w-full sm:block" : "block w-full"}>
        {children}
      </div>
    </>
  );
};
