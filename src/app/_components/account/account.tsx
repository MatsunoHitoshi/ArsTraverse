"use client";
import { api } from "@/trpc/react";
import { useSession } from "next-auth/react";
import { TabsContainer } from "../tab/tab";
import { ListboxInput } from "../input/listbox-input";
import React, { useState } from "react";
import type { LocaleEnum } from "@/app/const/types";
import Image from "next/image";

export const Account = () => {
  const { data: session } = useSession();
  const { data: user } = api.user.getProfile.useQuery();
  const [selectedLocale, setSelectedLocale] = useState<string>(
    user?.preferredLocale ?? "ja",
  );

  // ユーザーデータが読み込まれたら言語設定を更新
  React.useEffect(() => {
    if (user?.preferredLocale) {
      setSelectedLocale(user.preferredLocale);
    }
  }, [user?.preferredLocale]);
  const updateLocaleMutation = api.user.updatePreferredLocale.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  const handleLocaleChange = (locale: string) => {
    setSelectedLocale(locale);
    updateLocaleMutation.mutate({ locale: locale as LocaleEnum });
  };

  const localeOptions = [
    { value: "ja", label: "日本語" },
    { value: "en", label: "English" },
  ];

  if (!session) return null;

  return (
    <TabsContainer>
      <div className="p-6">
        <div className="mb-6">
          <div className="mb-4 text-lg font-semibold text-slate-50">
            プロフィール
          </div>

          <div className="w-full space-y-4">
            <div className="flex w-full flex-row items-center gap-6">
              {user?.image && (
                <Image
                  src={user?.image}
                  alt="プロフィール画像"
                  width={48}
                  height={48}
                  className="rounded-full border border-slate-50"
                />
              )}

              <div className="flex w-full flex-col items-start">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">
                    ユーザー名
                  </label>
                  <div className="px-3 py-2 text-slate-100">
                    {user?.name ?? "未設定"}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">
                    メールアドレス
                  </label>
                  <div className="px-3 py-2 text-slate-100">
                    {user?.email ?? "未設定"}
                  </div>
                </div>

                {/* <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                ユーザーID
              </label>
              <div className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-400">
                {user?.id ?? "読み込み中..."}
              </div>
            </div> */}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex flex-row items-end gap-2">
            <div className="mb-4 text-lg font-semibold text-slate-50">
              知識グラフの言語設定
            </div>
            <p className="mb-4 text-red-700">開発中です🙇‍♂️</p>
          </div>

          <p className="mb-6 text-slate-300">
            グラフ内のノード名の表示言語を設定できます。翻訳機能により、日本語と英語の両方の名前が自動的に生成されます。
          </p>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                優先表示言語
              </label>
              <div className="w-48">
                <ListboxInput
                  options={localeOptions}
                  selected={selectedLocale}
                  setSelected={handleLocaleChange}
                  placeholder="言語を選択"
                  // disabled={updateLocaleMutation.isPending}
                  disabled={true}
                />
              </div>
            </div>

            {updateLocaleMutation.isPending && (
              <div className="text-sm text-slate-400">設定を保存中...</div>
            )}

            {updateLocaleMutation.isError && (
              <div className="text-sm text-red-400">
                設定の保存に失敗しました。もう一度お試しください。
              </div>
            )}
          </div>
        </div>
      </div>
    </TabsContainer>
  );
};
