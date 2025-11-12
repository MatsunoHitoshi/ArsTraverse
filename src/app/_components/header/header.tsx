"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "../button/button";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardIcon } from "../icons";
import { loginProhibited, spAllowed } from "@/app/const/page-config";
import { usePathname } from "next/navigation";

export const Header = () => {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginProhibited = loginProhibited(pathname);
  const isSpAllowed = spAllowed(pathname);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);

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
          <div className="flex flex-row items-center gap-1 px-2">
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Button theme="transparent" size="small">
                ツールへ移動
              </Button>
            </a>
          </div>
        ) : (
          <>
            {!session ? (
              <Button
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="text-sm underline hover:no-underline"
              >
                SignUp/SignIn
              </Button>
            ) : (
              <div className="flex flex-row items-center gap-1 px-2">
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

                <Button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="text-sm underline hover:no-underline"
                >
                  SignOut
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
