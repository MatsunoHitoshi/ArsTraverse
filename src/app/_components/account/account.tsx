"use client";
// import { api } from "@/trpc/react";
import { useSession } from "next-auth/react";
import { TabsContainer } from "../tab/tab";
import { useTheme } from "@/app/_hooks/use-theme";
import { SunIcon, MoonIcon, DesktopIcon } from "../icons/icons";

export const Account = () => {
  const { data: session } = useSession();
  const { theme, changeTheme } = useTheme();
  // const { data: documents } = api.sourceDocument.getListBySession.useQuery();

  if (!session) return null;

  const themeOptions = [
    {
      value: "light",
      label: "ライトモード",
      description: "明るい背景で表示",
      icon: <SunIcon width={20} height={20} />,
    },
    {
      value: "dark",
      label: "ダークモード",
      description: "暗い背景で表示",
      icon: <MoonIcon width={20} height={20} />,
    },
    {
      value: "system",
      label: "システム設定",
      description: "OSの設定に従う",
      icon: <DesktopIcon width={20} height={20} />,
    },
  ];

  return (
    <TabsContainer>
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <h2 className="mb-2 text-2xl font-bold">アカウント設定</h2>
          <p className="text-gray-600 dark:text-gray-400">
            アプリケーションの設定を管理できます。
          </p>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <h3 className="mb-4 text-lg font-semibold">テーマ設定</h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              アプリケーションの外観を選択してください。
            </p>

            <div className="space-y-3">
              {themeOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center rounded-lg border p-4 transition-colors ${
                    theme === option.value
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 hover:bg-gray-50 dark:border-slate-600 dark:hover:bg-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={theme === option.value}
                    onChange={() =>
                      changeTheme(option.value as "light" | "dark" | "system")
                    }
                    className="sr-only"
                  />
                  <div className="flex items-center space-x-3">
                    <div
                      className={`rounded-md p-2 ${
                        theme === option.value
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {option.icon}
                    </div>
                    <div>
                      <div
                        className={`font-medium ${
                          theme === option.value
                            ? "text-blue-900 dark:text-blue-100"
                            : "text-gray-900 dark:text-gray-100"
                        }`}
                      >
                        {option.label}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {option.description}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </TabsContainer>
  );
};
