"use client";
import { api } from "@/trpc/react";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "../button/button";
import { TabsContainer } from "../tab/tab";
import { ListboxInput } from "../input/listbox-input";
import React, { useState, useTransition } from "react";
import type { LocaleEnum } from "@/app/const/types";
import Image from "next/image";
import { usePathname, useRouter } from "i18n/navigation";
import type { Locale } from "i18n/routing";

export const Account = () => {
  const t = useTranslations("account");
  const tNavigation = useTranslations("navigation");
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const utils = api.useUtils();
  const { data: user } = api.user.getProfile.useQuery();
  const [uiLocale, setUiLocale] = useState<string>(user?.uiLocale ?? "ja");
  const [preferredLocale, setPreferredLocale] = useState<string>(
    user?.preferredLocale ?? "ja",
  );
  const [localeLinked, setLocaleLinked] = useState<boolean>(
    user?.localeLinked ?? true,
  );

  React.useEffect(() => {
    if (user) {
      setUiLocale(user.uiLocale ?? "ja");
      setPreferredLocale(user.preferredLocale ?? "ja");
      setLocaleLinked(user.localeLinked ?? true);
    }
  }, [user]);

  const updateLocaleSettings = api.user.updateLocaleSettings.useMutation({
    onSuccess: () => {
      void utils.user.getProfile.invalidate();
    },
  });

  const localeOptions = [
    { value: "ja", label: t("languageJa") },
    { value: "en", label: t("languageEn") },
  ];

  const handleUiLocaleChange = (locale: string) => {
    setUiLocale(locale);
    updateLocaleSettings.mutate(
      {
        uiLocale: locale as LocaleEnum,
        localeLinked,
      },
      {
        onSuccess: () => {
          if (localeLinked) {
            setPreferredLocale(locale);
          }
          startTransition(() => {
            router.replace(pathname, { locale: locale as Locale });
          });
        },
      },
    );
  };

  const handleLocaleLinkedChange = (useSeparate: boolean) => {
    const newLocaleLinked = !useSeparate;
    setLocaleLinked(newLocaleLinked);
    updateLocaleSettings.mutate({
      localeLinked: newLocaleLinked,
      ...(newLocaleLinked ? { preferredLocale: uiLocale as LocaleEnum } : {}),
    });
    if (newLocaleLinked) {
      setPreferredLocale(uiLocale);
    }
  };

  const handlePreferredLocaleChange = (locale: string) => {
    setPreferredLocale(locale);
    updateLocaleSettings.mutate({ preferredLocale: locale as LocaleEnum });
  };

  const isSaving = updateLocaleSettings.isPending || isPending;

  if (!session) return null;

  return (
    <TabsContainer>
      <div className="p-6">
        <div className="mb-6">
          <div className="mb-4 text-lg font-semibold text-slate-50">
            {t("profile")}
          </div>

          <div className="w-full space-y-4">
            <div className="flex w-full flex-row items-center gap-6">
              {user?.image && (
                <Image
                  src={user?.image}
                  alt={t("profileImageAlt")}
                  width={48}
                  height={48}
                  className="rounded-full border border-slate-50"
                />
              )}

              <div className="flex w-full flex-col items-start">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">
                    {t("username")}
                  </label>
                  <div className="px-3 py-2 text-slate-100">
                    {user?.name ?? t("notSet")}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">
                    {t("email")}
                  </label>
                  <div className="px-3 py-2 text-slate-100">
                    {user?.email ?? t("notSet")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-4 text-lg font-semibold text-slate-50">
            {t("displayLanguage")}
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                {t("displayLanguage")}
              </label>
              <div className="w-48">
                <ListboxInput
                  options={localeOptions}
                  selected={uiLocale}
                  setSelected={handleUiLocaleChange}
                  placeholder={t("selectLanguage")}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-4 text-lg font-semibold text-slate-50">
            {t("graphLanguageSettings")}
          </div>

          <p className="mb-6 text-slate-300">{t("graphLanguageDescription")}</p>

          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={!localeLinked}
                onChange={(event) =>
                  handleLocaleLinkedChange(event.target.checked)
                }
                disabled={isSaving}
              />
              {t("separateGraphLanguage")}
            </label>

            {!localeLinked && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">
                  {t("preferredDisplayLanguage")}
                </label>
                <div className="w-48">
                  <ListboxInput
                    options={localeOptions}
                    selected={preferredLocale}
                    setSelected={handlePreferredLocaleChange}
                    placeholder={t("selectLanguage")}
                    disabled={isSaving}
                  />
                </div>
              </div>
            )}

            {isSaving && (
              <div className="text-sm text-slate-400">{t("savingSettings")}</div>
            )}

            {updateLocaleSettings.isError && (
              <div className="text-sm text-red-400">{t("saveError")}</div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-600 pt-6">
          <Button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-slate-300 underline hover:text-slate-50 hover:no-underline"
            theme="transparent"
          >
            {tNavigation("signOut")}
          </Button>
        </div>
      </div>
    </TabsContainer>
  );
};
