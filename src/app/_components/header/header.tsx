"use client";
import Image from "next/image";
import { Button } from "../button/button";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { DashboardIcon } from "../icons";
import { loginProhibited } from "@/app/const/page-config";
import { ThemeToggle } from "../theme/theme-toggle";

export const Header = () => {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginProhibited = loginProhibited(pathname);
  return (
    <div className="z-20 w-full p-1">
      <div className="flex h-12 w-full flex-row items-center justify-between rounded-2xl bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-50">
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
                  <ThemeToggle />
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
                    <div>{session.user.name}</div>
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
