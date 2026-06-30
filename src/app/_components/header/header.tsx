"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "../button/button";
import { signIn, useSession } from "next-auth/react";
import { useRouter, usePathname } from "i18n/navigation";
import { DashboardIcon } from "../icons";
import { loginProhibited, spAllowed } from "@/app/const/page-config";

export const Header = () => {
  const t = useTranslations("navigation");
  const tDashboard = useTranslations("dashboard");
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginProhibited = loginProhibited(pathname);
  const isSpAllowed = spAllowed(pathname);
  const [isVisible, setIsVisible] = useState(true);
  const [isFieldCameraActive, setIsFieldCameraActive] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const syncFieldCamera = () => {
      setIsFieldCameraActive(
        document.body.dataset.fieldCameraActive === "true",
      );
    };

    syncFieldCamera();
    const observer = new MutationObserver(syncFieldCamera);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-field-camera-active"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isSpAllowed) {
      return;
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDownThreshold = 80; // 80px以上のスクロールで反応
      const scrollUpThreshold = 120; // 120px以上のスクロールで反応
      const lastScrollY = lastScrollYRef.current;
      const scrollDelta = lastScrollY - currentScrollY; // 上方向へのスクロール量

      // 上にスクロールした場合（scrollUpThreshold以上上にスクロールしたら表示）
      if (currentScrollY < lastScrollY && scrollDelta >= scrollUpThreshold) {
        setIsVisible(true);
      }
      // 下にスクロールした場合（scrollDownThreshold以上下にスクロールしたら非表示）
      else if (
        currentScrollY > lastScrollY &&
        currentScrollY > scrollDownThreshold
      ) {
        setIsVisible(false);
      }
      // トップに戻った場合は常に表示
      else if (currentScrollY <= scrollDownThreshold) {
        setIsVisible(true);
      }

      lastScrollYRef.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isSpAllowed]);

  if (isFieldCameraActive) {
    return null;
  }

  return (
    <div
      className={`z-20 w-full p-1 transition-transform duration-300 ease-in-out ${
        isSpAllowed && !isVisible ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="flex h-12 w-full flex-row items-center justify-between rounded-2xl bg-slate-700 text-slate-50">
        <div className="text-md font-semibold">
          <Button
            className="!py-0"
            onClick={() => {
              if (session) {
                router.push("/dashboard");
              } else if (isLoginProhibited) {
                router.push("/about");
              } else {
                router.push("/");
              }
            }}
          >
            <div>ArsTraverse</div>
          </Button>
        </div>

        {isLoginProhibited ? (
          <div className="flex flex-row items-center gap-2 px-2">
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Button theme="transparent" size="small">
                {tDashboard("moveToTool")}
              </Button>
            </a>
          </div>
        ) : (
          <>
            {!session ? (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                  className="text-sm underline hover:no-underline"
                >
                  {t("signUp")}/{t("signIn")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-row items-center gap-2 px-2">
                <div className="flex flex-row items-center">
                  <Button
                    onClick={() => {
                      router.push("/dashboard");
                    }}
                    className="flex !h-10 cursor-pointer flex-row items-center gap-1 rounded-md p-2 hover:bg-slate-50/10"
                  >
                    <DashboardIcon width={18} height={18} />
                  </Button>
                  <Button
                    onClick={() => {
                      router.push("/account");
                    }}
                    className="flex cursor-pointer flex-row items-center gap-1 rounded-md p-2 hover:bg-slate-50/10"
                  >
                    <Image
                      alt=""
                      src={session.user.image ?? ""}
                      height={24}
                      width={24}
                      className="rounded-full border border-slate-50"
                    />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
